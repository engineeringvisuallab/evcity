// J0 SITE CHECK (headless, READ ONLY) for the 300 ft junction: ring (road 0) x R6-9 x R4-9 at about (-1547,-2464).
// Run: npx tsx scripts/j300-site-check.ts [dir]   (default docs)   writes dir/J300_SITE.txt and dir/J300_SITE.json
// Measures along the ring straight (PI3 -> PI4) +-700 m of the crossing: natural ground, carved ground (= ring level), water, rail, buildings,
// engineering areas, other roads, neighbouring ring junctions. Nothing in src or data is changed. World metres: x east, z south.
import { writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { collectCentreSet } from '../src/roads/debug/RoadCentreSet';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { ENGINEERING_AREAS, getEngineeringAreaAt } from '../src/city/EngineeringZones';
import { RING_PIS, RING_RADIAL_JOINS } from '../src/roads/alignment/RingAlignment';
import { planRing } from '../src/roads/ring/RingRoad';
const PLAN: any = planRing(5);
const ringNear = (x: number, z: number): { y: number; st: number } => { let b = 1e9, y = 0, st = 0; for (let i = 0; i < PLAN.pts.length; i++) { const d = Math.hypot(PLAN.pts[i][0] - x, PLAN.pts[i][1] - z); if (d < b) { b = d; y = PLAN.ys[i]; st = PLAN.stations[i]; } } return { y, st }; };

const OUT = process.argv[2] ?? 'docs';
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const natH = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const carved = (x: number, z: number): number => ringNear(x, z).y;   // finished ring surface height from planRing (docs/ring_profile.csv)
const wetD = (x: number, z: number): number => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h ? sc.water - sc.h : 0; };
const waterLvl = (x: number, z: number): number => { gen.sample(x, z, sc); return Number.isNaN(sc.water) ? NaN : sc.water; };
const A: any = RING_PIS[3], B: any = RING_PIS[4];   // PI3, PI4 (straight between them)
const ax = A.x ?? A[0], az = A.z ?? A[1], bx = B.x ?? B[0], bz = B.z ?? B[1];
const LEN = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / LEN, uz = (bz - az) / LEN, nx = -uz, nz = ux;
const C = { x: -1547, z: -2464 };
const s0 = (C.x - ax) * ux + (C.z - az) * uz;
const at = (s: number, v: number): { x: number; z: number } => ({ x: ax + ux * s + nx * v, z: az + uz * s + nz * v });
const HALF = 700, ROW = 45.72;
pr('J0 SITE CHECK 300 ft junction (headless, read only, nothing in src or data changed)');
pr(`ring straight PI3->PI4 length ${f0(LEN)} m, heading ${f1(Math.atan2(-uz, ux) * 180 / Math.PI)} deg, crossing at s=${f0(s0)} m from PI3 (x ${C.x}, z ${C.z}), zone s ${f0(s0 - HALF)} .. ${f0(s0 + HALF)} (needs to stay inside 0 .. ${f0(LEN)}: ${s0 - HALF > 0 && s0 + HALF < LEN ? 'PASS' : 'FAIL (zone leaves the straight, curves inside the junction zone)'})`);
// 1) ground along the axis
const st: { s: number; nat: number; ring: number; nL: number; nR: number; wet: number }[] = [];
for (let s = s0 - HALF; s <= s0 + HALF; s += 10) {
  const c = at(s, 0), l = at(s, -ROW), r = at(s, ROW);
  st.push({ s: s - s0, nat: natH(c.x, c.z), ring: carved(c.x, c.z), nL: natH(l.x, l.z), nR: natH(r.x, r.z), wet: Math.max(wetD(c.x, c.z), wetD(l.x, l.z), wetD(r.x, r.z)) });
}
const mn = (a: number[]): number => Math.min(...a), mx = (a: number[]): number => Math.max(...a);
pr(''); pr('1) GROUND along the ring axis (every 10 m, -700 .. +700 m from the crossing, u>0 = towards PI4)');
pr(`natural ground at axis: min ${f1(mn(st.map((p) => p.nat)))} m, max ${f1(mx(st.map((p) => p.nat)))} m, at crossing ${f1(st.find((p) => p.s === 0)!.nat)} m`);
pr(`ring level (finished surface, planRing ys): min ${f1(mn(st.map((p) => p.ring)))} m, max ${f1(mx(st.map((p) => p.ring)))} m, at crossing ${f1(st.find((p) => p.s === 0)!.ring)} m`);
let maxG = 0, maxGs = 0, maxCross = 0, maxCs = 0;
for (let i = 3; i < st.length; i++) { const g = Math.abs(st[i].ring - st[i - 3].ring) / 30; if (g > maxG) { maxG = g; maxGs = st[i].s; } }
for (const p of st) { const cs = Math.abs(p.nL - p.nR) / (2 * ROW); if (cs > maxCross) { maxCross = cs; maxCs = p.s; } }
pr(`max ring grade over 30 m: ${f2(maxG * 100)} % at u ${f0(maxGs)} (design limit for the 8-lane ring: see Criteria; the trench ramps need 3 .. 4 %)`);
pr(`max natural cross slope over the 91.44 m ROW: ${f2(maxCross * 100)} % at u ${f0(maxCs)} (limit 6 % ASSUMED)  ${maxCross <= 0.06 ? 'PASS' : 'FAIL'}`);
// trench cut estimate: depth below natural ground if the ring is dived 7.8 m below ring level in |u|<250 and ramps 4 % to |u|=450 (ASSUMED shape)
let cutV = 0;
for (const p of st) { const a = Math.abs(p.s), d = a >= 450 ? 0 : Math.min(7.8, 0.04 * (450 - a)); cutV += d * 35 * 10; }
const cst = ringNear(C.x, C.z); pr(`ring station at the crossing: ${f0(cst.st)} m of ${f0(PLAN.length)} m (ring_profile.csv)`);
const fillH = st.map((p) => p.ring - p.nat); pr(`ring surface minus natural ground (fill + / cut -): at crossing ${f1(fillH[70])} m, max fill ${f1(mx(fillH))} m at u ${f0(st[fillH.indexOf(mx(fillH))].s)}, max cut ${f1(-mn(fillH))} m at u ${f0(st[fillH.indexOf(mn(fillH))].s)}`);
for (const u of [-700, -600, -500, -450, -300, -150, 0, 150, 300, 450, 560, 700]) { const q = st.find((p) => Math.round(p.s) === u); if (q) pr(`  u ${u}: natural ${f1(q.nat)}  ring ${f1(q.ring)}  ring - natural ${f1(q.ring - q.nat)}`); }
pr(`rough trench excavation (ASSUMED shape 7.8 m deep, 35 m wide, 4 % ramps, ring level kept): ${f0(cutV)} m3 (about ${f0(cutV / 1000)} thousand m3)`);
pr(`low natural ground within the zone (lower than ring level + 1 m, cut would be small there): ${st.filter((p) => p.nat < p.ring - 1).length} of ${st.length} samples; high natural ground (higher than ring level + 1 m, hill cut): ${st.filter((p) => p.nat > p.ring + 1).length} of ${st.length}`);
// 2) water
pr(''); pr('2) WATER (sc.water > ground, lakes, river, sea) inside the 91.44 m ROW over the 1400 m zone, and groundwater proxy');
const wetS = st.filter((p) => p.wet > 0);
pr(`wet stations (u, m): ${wetS.map((p) => f0(p.s)).join(' ')}`);
pr(`samples with surface water: ${wetS.length} of ${st.length}  ${wetS.length === 0 ? 'PASS' : 'FAIL (water on the junction ground)'}`);
let nearW = 1e9, nearWp = { x: 0, z: 0 }, wl = NaN;
for (let r = 0; r <= 700; r += 25) for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, x = C.x + r * Math.cos(a), z = C.z + r * Math.sin(a); if (wetD(x, z) > 0 && r < nearW) { nearW = r; nearWp = { x, z }; wl = waterLvl(x, z); } }
pr(nearW < 1e9 ? `nearest water within 700 m: about ${f0(nearW)} m from the crossing at (${f0(nearWp.x)}, ${f0(nearWp.z)}), water level ${f1(wl)} m (a trench floor deeper than that level + capillary rise needs the flotation check, NOT RUN here)` : 'no surface water within 700 m of the crossing (groundwater itself is NOT modelled in the game: flotation check = NOT RUN, uses ASSUMED water level in J3 / J7)');
// 3) rail
pr(''); pr('3) RAIL (gen.rail.edges) distance to the ring axis and to the crossing');
const railEdges: { id: any; xs: ArrayLike<number>; zs: ArrayLike<number> }[] = (gen.rail.edges as any[]).map((e, i) => ({ id: e.id ?? i, xs: e.xs, zs: e.zs }));
let rMin = 1e9, rId: any = null, rAtS = 0;
for (const e of railEdges) for (let i = 0; i < e.xs.length; i++) for (let s = s0 - HALF; s <= s0 + HALF; s += 20) { const c = at(s, 0), d = Math.hypot(e.xs[i] - c.x, e.zs[i] - c.z); if (d < rMin) { rMin = d; rId = e.id; rAtS = s - s0; } }
pr(`closest rail point to the ring axis in the zone: ${f0(rMin)} m (edge ${rId}, at u ${f0(rAtS)}); ROW half 45.72 + clearance 30 = 75.7 m  ${rMin >= 75.7 ? 'PASS' : 'FAIL (rail inside ROW + clearance)'}`);
let rCross = 0; for (const e of railEdges) for (let i = 1; i < e.xs.length; i++) { for (let s = s0 - HALF; s < s0 + HALF; s += 20) { const p = at(s, 0), q = at(s + 20, 0); const d1 = (e.xs[i - 1] - p.x) * (q.z - p.z) - (e.zs[i - 1] - p.z) * (q.x - p.x), d2 = (e.xs[i] - p.x) * (q.z - p.z) - (e.zs[i] - p.z) * (q.x - p.x); const d3 = (p.x - e.xs[i - 1]) * (e.zs[i] - e.zs[i - 1]) - (p.z - e.zs[i - 1]) * (e.xs[i] - e.xs[i - 1]), d4 = (q.x - e.xs[i - 1]) * (e.zs[i] - e.zs[i - 1]) - (q.z - e.zs[i - 1]) * (e.xs[i] - e.xs[i - 1]); if (d1 * d2 < 0 && d3 * d4 < 0) rCross++; } }
pr(`rail crossing the ring axis in the zone: ${rCross} (closest rail point at u ${f0(rAtS)} = where the ring meets the rail; this is a ring / rail crossing that is already in the game)  ${rCross === 0 ? 'PASS' : 'FAIL'}`);
let rA = 1e9; for (const e of railEdges) for (let i = 0; i < e.xs.length; i++) rA = Math.min(rA, Math.hypot(e.xs[i] - C.x, e.zs[i] - C.z));
pr(`closest rail point to the crossing itself: ${f0(rA)} m`);
// 4) buildings
pr(''); pr('4) BUILDINGS (Placements + PlacementsFill, footprint W x D incl. yard) inside the ROW corridor +-46 m of the axis over the zone, and within 300 m of the crossing');
const RECTS: any[] = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS]; const inRow: any[] = [], near: any[] = [];
for (const b of RECTS) { const s = (b.x - ax) * ux + (b.z - az) * uz - s0, v = (b.x - ax) * nx + (b.z - az) * nz; const r = Math.hypot(b.w ?? b.W ?? 10, b.d ?? b.D ?? 10) / 2; if (Math.abs(s) <= HALF && Math.abs(v) <= ROW + r) inRow.push({ id: b.id, x: b.x, z: b.z, u: s, v }); if (Math.hypot(b.x - C.x, b.z - C.z) <= 300) near.push({ id: b.id, d: Math.hypot(b.x - C.x, b.z - C.z) }); }
pr(`buildings touching the 91.44 m ROW over the 1400 m zone: ${inRow.length}  ${inRow.length === 0 ? 'PASS' : 'FAIL (list below; buildings are replaced later, so not blocking, report only)'}`);
for (const b of inRow.slice(0, 20)) pr(`  ${b.id} at (${f0(b.x)}, ${f0(b.z)}) u ${f0(b.u)} v ${f0(b.v)}`);
pr(`buildings within 300 m of the crossing: ${near.length}`);
// 5) engineering areas
pr(''); pr('5) ENGINEERING AREAS (ENGINEERING_AREAS) at the zone');
const areas = new Set<string>(); for (let s = s0 - HALF; s <= s0 + HALF; s += 20) for (const v of [-ROW, 0, ROW]) { const p = at(s, v), a = getEngineeringAreaAt(p.x, p.z); if (a) areas.add(a.id); }
pr(`areas touching the ROW corridor: ${areas.size === 0 ? 'none  PASS' : [...areas].join(', ') + '  FAIL (report)'}`);
const cArea = getEngineeringAreaAt(C.x, C.z); pr(`area at the crossing: ${cArea ? cArea.id : 'none'}`);
// 6) other roads and neighbours
pr(''); pr('6) OTHER ROADS within 150 m of the axis in the zone, and neighbouring ring junctions');
const set = collectCentreSet(gen); const hits = new Map<string, number>();
for (const l of set.lines) { const pts: any[] = (l as any).pts ?? (l as any).points ?? []; let best = 1e9, at_ = 0; for (const p of pts) { const x = p.x ?? p[0], z = p.z ?? p[1]; const s = (x - ax) * ux + (z - az) * uz - s0, v = (x - ax) * nx + (z - az) * nz; if (Math.abs(s) <= HALF && Math.abs(v) < best) { best = Math.abs(v); at_ = s; } } if (best < 150) hits.set(`${(l as any).id} cls ${(l as any).cls ?? '?'} (${(l as any).source ?? ''})`, Math.round(best) * 10000 + Math.round(at_)); }
for (const [k, v] of hits) pr(`  ${k}: closest to the axis ${Math.floor(Math.abs(v) / 10000)} m`);
for (const j of RING_RADIAL_JOINS) { const d = Math.hypot(j.x - C.x, j.z - C.z); pr(`  ring radial join ${j.dir} st ${f0(j.station)} at (${f0(j.x)}, ${f0(j.z)}): ${f0(d)} m from the crossing`); }
pr(''); pr('NOT RUN: groundwater level and flotation (not modelled in the game), trees on the ROW (vegetation placement not read), hydrology of the trench (pump / drain), real grade of the ring in the zone beyond the carved ground (profile comes in J1).');
writeFileSync(`${OUT}/J300_SITE.txt`, L.join('\n') + '\n'); writeFileSync(`${OUT}/J300_SITE.json`, JSON.stringify({ s0, st, rMin, inRow, areas: [...areas], cutV }, null, 1));
