// STEP 6.1e (headless): GROUND CHECK of the four M8 arms of J1 (N, E, S, W), s >= 340 (the J1 lane zone s 0..340 was checked in J1-c1 / J1-e1). Only reads the world, changes nothing.
// Like 2.5 for the ring: over the whole right of way (ROW, 40 m each side) it looks at water, rivers, rail, terrain class, earthwork at the formation edge, world zones, facility fences, city plan areas, map edge.
// Run: npx tsx scripts/j1-arms-ground-check.ts docs    needs docs/j1c{4b,7b,6b,5b}_align.json, j1c{4c,7c,6c,5c}_profile.json, j1_structures_NW.json, j1_structures_E.json, j1_structures_S.json
// Writes docs/j1_arms_ground.json + docs/STEP61E_OUTPUT.txt. Rules (user, 2026-11-14): ONLY THE RAILWAY IS FIXED. Zones, parks, buildings may be crossed (they are re-placed to the roads later, J1-f / 6.2b), so they are LISTED, not failed.
// Hard stops: water on the centreline outside a structure, a river or rail crossing outside a structure, a facility fence (airport / seaport / army) or the sea inside the ROW, the map edge, a centre cut over 12 m (3.7).
import { RAIL_DESIGN } from '../src/rail/RailPlan';
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { getWorldZoneAt, coastZ, FACILITIES } from '../src/city/WorldZones';
import { CityPlan } from '../src/city/CityPlan';

const out = process.argv[2] ?? 'docs';
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number): { h: number; w: number } => { gen.sampleNatural(x, z, sc); return { h: sc.h, w: sc.water }; };

const ROW = 40, EDGE = 24.2, SJ = 340, CUT_MAX = 12, FILL_VIADUCT = 7, FENCE_MIN = 45, MAP_HALF = Config.world.size / 2, RAIL_NEAR = 60, ARM_GAP = 2 * ROW;
const OFF = [-40, -30, -24.2, -20, -10, 0, 10, 20, 24.2, 30, 40];
const lines: string[] = []; const P = (s = ''): void => { lines.push(s); console.log(s); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1);
const chk: Array<{ name: string; pass: boolean; detail: string }> = [];
const CHK = (name: string, pass: boolean, detail: string): void => { chk.push({ name, pass, detail }); P(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(78)} ${detail}`); };

const ARMS = [
  { id: 'N', align: 'j1c4b_align.json', prof: 'j1c4c_profile.json', struct: 'j1_structures_NW.json' },
  { id: 'E', align: 'j1c7b_align.json', prof: 'j1c7c_profile.json', struct: 'j1_structures_E.json' },
  { id: 'S', align: 'j1c6b_align.json', prof: 'j1c6c_profile.json', struct: 'j1_structures_S.json' },
  { id: 'W', align: 'j1c5b_align.json', prof: 'j1c5c_profile.json', struct: 'j1_structures_NW.json' },
];
interface Row { s: number; x: number; z: number; nx: number; nz: number; road: number; hc: number; cross: number; edgeCut: number; edgeFill: number; wetC: boolean; wetRow: boolean; sea: boolean; zone: string; kind: string; area: string; edgeKinds: string[] }
interface Range { a: number; b: number; len: number; label: string; max?: number; at?: number }
const load = (f: string): any => JSON.parse(readFileSync(`${out}/${f}`, 'utf8'));
const ranges = (rows: Row[], label: (r: Row) => string | null, val?: (r: Row) => number): Range[] => {
  const res: Range[] = []; let cur: Range | null = null;
  for (const r of rows) {
    const l = label(r); if (l === null) { cur = null; continue; }
    const v = val ? val(r) : 0;
    if (cur && cur.label === l && r.s - cur.b <= 7.5) { cur.b = r.s; if (val && v > (cur.max ?? -Infinity)) { cur.max = v; cur.at = r.s; } }
    else { cur = { a: r.s, b: r.s, len: 0, label: l, max: val ? v : undefined, at: r.s }; res.push(cur); }
  }
  for (const r of res) r.len = r.b - r.a + 5;
  return res;
};
const isSea = (x: number, z: number, h: number): boolean => h < 0.6 && z > coastZ(x) - 30;
const segX = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): { t: number; u: number } | null => {
  const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz, den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / den, u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
  return t < 0 || t >= 1 || u < 0 || u > 1 ? null : { t, u };
};

const all: Record<string, { rows: Row[]; length: number; structs: Array<{ id: string; s0: number; s1: number }> }> = {};
for (const A of ARMS) {
  const al = load(A.align), pf = load(A.prof), st = load(A.struct);
  const smp = al.samples as number[][], pr = pf.rows as number[][];
  if (smp.length !== pr.length) throw new Error(`${A.id}: ${smp.length} plan samples but ${pr.length} profile rows`);
  const rows: Row[] = [];
  for (let i = 0; i < smp.length; i++) {
    const a = smp[Math.max(0, i - 1)], b = smp[Math.min(smp.length - 1, i + 1)], dx = b[1] - a[1], dz = b[2] - a[2], dl = Math.hypot(dx, dz) || 1;
    const nx = -dz / dl, nz = dx / dl, x = smp[i][1], z = smp[i][2], road = pr[i][2];
    let wetRow = false, wetC = false, sea = false, hc = 0, cross = 0, prev = NaN, edgeCut = -1e9, edgeFill = -1e9;
    const edgeKinds = new Set<string>();
    for (const o of OFF) {
      const g = ground(x + nx * o, z + nz * o), wet = !Number.isNaN(g.w) && g.h < g.w - 0.05;
      if (wet) wetRow = true;
      if (o === 0) { hc = g.h; if (wet) { wetC = true; sea = isSea(x, z, g.h); } }
      if (!Number.isNaN(prev) && o !== 24.2 && OFF[OFF.indexOf(o) - 1] !== 24.2) cross = Math.max(cross, (Math.abs(g.h - prev) / (o - OFF[OFF.indexOf(o) - 1])) * 100);
      prev = g.h;
      if (Math.abs(o) === EDGE) { edgeCut = Math.max(edgeCut, g.h - road); edgeFill = Math.max(edgeFill, road - g.h); }
      if (o === -ROW || o === ROW) { const zz = getWorldZoneAt(x + nx * o, z + nz * o); if (['airport', 'seaport', 'army', 'sea'].includes(zz.kind)) edgeKinds.add(`${zz.id} (${zz.kind})`); }
    }
    const zc = getWorldZoneAt(x, z), ar = plan.areaAt(x, z);
    rows.push({ s: SJ + smp[i][0], x, z, nx, nz, road, hc, cross, edgeCut, edgeFill, wetC, wetRow, sea, zone: zc.id, kind: zc.kind, area: ar ? `site ${ar.site} ${ar.id} (${ar.kind})` : '-', edgeKinds: [...edgeKinds] });
  }
  all[A.id] = { rows, length: SJ + (al.length as number), structs: (st[A.id].structures as any[]).map((q) => ({ id: q.id, s0: q.s0, s1: q.s1 })) };
}

const cls = (c: number): string => (c < 10 ? 'flat' : c < 25 ? 'rolling' : c < 60 ? 'HILLY' : 'STEEP');
const profRail: Record<string, any[]> = {};
for (const A of ARMS) profRail[A.id] = load(A.prof).crossings;

for (const A of ARMS) {
  const { rows, length, structs } = all[A.id];
  const inS = (s: number): boolean => structs.some((q) => s >= q.s0 && s <= q.s1);
  P(`\n==================== ${A.id} ARM: s ${SJ}..${f0(length)} (${f0(length - SJ)} m), ${rows.length} stations every 5 m, ROW +-${ROW} m, ground = natural terrain ====================`);
  // 1 water
  const wetC = ranges(rows, (r) => (r.wetC ? (r.sea ? 'SEA' : 'river / lake') : null));
  P('1. WATER ON THE CENTRELINE'); if (!wetC.length) P('  none'); for (const r of wetC) P(`  s ${f0(r.a).padStart(5)}-${f0(r.b).padStart(5)}  ${f0(r.len).padStart(4)} m  ${r.label}  ${inS(r.a) && inS(r.b) ? '(inside a structure)' : '(OUTSIDE a structure)'}`);
  const wetRow = ranges(rows, (r) => (!r.wetC && r.wetRow ? 'water in the ROW only' : null));
  P(`   water inside the ROW but not on the centreline: ${wetRow.length ? wetRow.map((r) => `s ${f0(r.a)}-${f0(r.b)} (${f0(r.len)} m)`).join(', ') : 'none'}`);
  // 2 rivers
  const rivX: Array<{ s: number; width: number; ws: number; angle: number }> = [];
  for (const sg of gen.rivers.segments) for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i], b = rows[i + 1], h = segX(a.x, a.z, b.x, b.z, sg.ax, sg.az, sg.bx, sg.bz); if (!h) continue;
    const ang = Math.abs(((Math.atan2(b.z - a.z, b.x - a.x) - Math.atan2(sg.bz - sg.az, sg.bx - sg.ax)) * 180) / Math.PI) % 180;
    rivX.push({ s: a.s + h.t * 5, width: (sg.hwA + (sg.hwB - sg.hwA) * h.u) * 2, ws: sg.wsA + (sg.wsB - sg.wsA) * h.u, angle: Math.min(ang, 180 - ang) });
  }
  rivX.sort((p, q) => p.s - q.s);
  P('2. RIVER SEGMENTS CROSSING THE CENTRELINE'); if (!rivX.length) P('  none'); for (const r of rivX) P(`  s ${f0(r.s).padStart(5)}  channel width ${f1(r.width)} m  water level ${f1(r.ws)} m  angle ${f0(r.angle)} deg  ${inS(r.s) ? '(inside a structure)' : '(OUTSIDE a structure)'}`);
  // 3 terrain
  const tally: Record<string, number> = { flat: 0, rolling: 0, HILLY: 0, STEEP: 0 }; for (const r of rows) tally[cls(r.cross)] += 5;
  P(`3. TERRAIN CLASS (steepest 10 m step across the ROW)   ${Object.keys(tally).map((k) => `${k} ${f0(tally[k])} m (${f1((tally[k] / (length - SJ)) * 100)} %)`).join(', ')}`);
  const cutC = Math.max(...rows.map((r) => r.hc - r.road)), cutE = Math.max(...rows.map((r) => r.edgeCut)), fillE = Math.max(...rows.map((r) => r.edgeFill));
  P(`   earthwork against the natural ground: max cut on the centreline ${f1(cutC)} m, max cut at the formation edge (+-${EDGE} m) ${f1(cutE)} m, max fill at the edge ${f1(fillE)} m`);
  const deep = ranges(rows, (r) => (r.edgeCut > CUT_MAX ? 'edge cut > 12 m' : null), (r) => r.edgeCut);
  P(`   edge cut over ${CUT_MAX} m (side slopes steeper than 1:2 are ROCK CUT up to 4:1, user decision 5.2a): ${deep.length ? deep.map((r) => `s ${f0(r.a)}-${f0(r.b)} max ${f1(r.max ?? 0)} m`).join(', ') : 'none'}`);
  const tall = ranges(rows, (r) => (r.road - r.hc > FILL_VIADUCT && !inS(r.s) ? 'fill > 7 m outside a structure' : null));
  P(`   fill over ${FILL_VIADUCT} m on the centreline outside a structure: ${tall.length ? tall.map((r) => `s ${f0(r.a)}-${f0(r.b)}`).join(', ') : 'none'}`);
  // 4 rail
  const railX: Array<{ s: number; edge: string; angle: number }> = [];
  for (const e of gen.rail.edges) for (let j = 0; j + 1 < e.xs.length; j++) for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i], b = rows[i + 1], h = segX(a.x, a.z, b.x, b.z, e.xs[j], e.zs[j], e.xs[j + 1], e.zs[j + 1]); if (!h) continue;
    const ang = Math.abs(((Math.atan2(b.z - a.z, b.x - a.x) - Math.atan2(e.zs[j + 1] - e.zs[j], e.xs[j + 1] - e.xs[j])) * 180) / Math.PI) % 180;
    railX.push({ s: a.s + h.t * 5, edge: e.id, angle: Math.min(ang, 180 - ang) });
  }
  railX.sort((p, q) => p.s - q.s);
  P('4. RAILWAY CROSSINGS (the railway cannot change; every one must be road OVER rail, inside a structure)'); if (!railX.length) P('  none');
  for (const r of railX) { const pc = profRail[A.id].find((c: any) => c.edge === r.edge && Math.abs(c.s - r.s) < 25); P(`  s ${f0(r.s).padStart(5)}  line ${r.edge.padEnd(11)} angle ${f0(r.angle)} deg  ${pc ? `profile gap ${pc.gap.toFixed(2)} m` : 'NOT IN THE PROFILE LIST'}  ${inS(r.s) ? '(inside a structure)' : '(OUTSIDE a structure)'}`); }
  const near = rows.map((r) => { let d = 1e9, id = ''; for (const e of gen.rail.edges) for (let j = 0; j < e.xs.length; j++) { const q = Math.hypot(r.x - e.xs[j], r.z - e.zs[j]); if (q < d) { d = q; id = e.id; } } return { d, id }; });
  const rc = ranges(rows.map((r, i) => ({ ...r, kind: near[i].d < RAIL_NEAR ? near[i].id : '' })), (r) => (r.kind ? r.kind : null)).filter((r) => !railX.some((x) => x.s >= r.a - 40 && x.s <= r.b + 40));
  P(`   rail closer than ${RAIL_NEAR} m to the centreline away from a crossing (parallel running): ${rc.length ? rc.map((r) => `${r.label} s ${f0(r.a)}-${f0(r.b)}`).join(', ') : 'none'}`);
  // 5 zones
  const zr = ranges(rows, (r) => `${r.zone} (${r.kind})`);
  P('5. WORLD ZONE UNDER THE CENTRELINE'); for (const r of zr) P(`  s ${f0(r.a).padStart(5)}-${f0(r.b).padStart(5)}  ${f0(r.len).padStart(5)} m  ${r.label}`);
  const hard = ranges(rows, (r) => (r.edgeKinds.length ? r.edgeKinds.join(', ') : null));
  P(`   facility fence / sea touching the ROW edges: ${hard.length ? hard.map((r) => `${r.label} s ${f0(r.a)}-${f0(r.b)}`).join('; ') : 'none'}`);
  const ar = ranges(rows, (r) => (r.area !== '-' ? r.area : null));
  P('6. CITY PLAN AREAS UNDER THE CENTRELINE (re-zoning list for J1-f / 6.2b; crossing is allowed, user 2026-11-14)'); if (!ar.length) P('  none'); for (const r of ar) P(`  s ${f0(r.a).padStart(5)}-${f0(r.b).padStart(5)}  ${f0(r.len).padStart(5)} m  ${r.label}`);
  // 7 fences, map edge
  let fmin = 1e9, fid = ''; for (const f of FACILITIES) for (const r of rows) { const d = Math.hypot(Math.max(f.x0 - r.x, 0, r.x - f.x1), Math.max(f.z0 - r.z, 0, r.z - f.z1)); if (d < fmin) { fmin = d; fid = f.id; } }
  const edgeD = Math.min(...rows.map((r) => MAP_HALF - Math.max(Math.abs(r.x), Math.abs(r.z))));
  P(`7. nearest facility fence: ${fid} ${f0(fmin)} m; nearest map edge: ${f0(edgeD)} m`);
  P('   CHECKS');
  CHK(`${A.id}: every wet centreline point is inside a structure`, rows.every((r) => !r.wetC || inS(r.s)), `${f0(wetC.reduce((a, r) => a + r.len, 0))} m wet`);
  CHK(`${A.id}: no sea on the centreline`, rows.every((r) => !r.sea), 'sea m = ' + rows.filter((r) => r.sea).length * 5);
  CHK(`${A.id}: every river crossing is inside a structure`, rivX.every((r) => inS(r.s)), `${rivX.length} crossings`);
  // RAIL-B STEP 3: a crossing may also be on the GROUND when the rail passes over the lowered road (deck underside >= 7.0 m over the road); the rail bridge is then the structure
  const railOver = (r: { s: number; edge: string }): boolean => profRail[A.id].some((c: any) => c.edge === r.edge && Math.abs(c.s - r.s) < 25 && c.gap <= -(RAIL_DESIGN.ballast + RAIL_DESIGN.deckThick + 7.0));
  CHK(`${A.id}: every rail crossing is inside a road structure, or the rail passes over the road with >= 7.0 m, and is in the profile list (X5)`, railX.every((r) => (inS(r.s) || railOver(r)) && profRail[A.id].some((c: any) => c.edge === r.edge && Math.abs(c.s - r.s) < 25)), `${railX.length} from the world, ${profRail[A.id].length} in the profile, ${railX.filter((r) => !inS(r.s) && railOver(r)).length} of them rail over the road on the ground`);
  CHK(`${A.id}: fill over ${FILL_VIADUCT} m only inside a structure (D4)`, tall.length === 0, `${tall.length} ranges outside`);
  CHK(`${A.id}: max cut on the centreline <= ${CUT_MAX} m (3.7)`, cutC <= CUT_MAX + 0.05, `max ${f1(cutC)} m`);
  CHK(`${A.id}: no facility fence (airport / seaport / army) or sea inside the ROW`, hard.length === 0 && fmin >= FENCE_MIN, `nearest fence ${fid} ${f0(fmin)} m`);
  CHK(`${A.id}: ROW stays inside the map (>= 100 m from the edge)`, edgeD >= 100, `${f0(edgeD)} m`);
}

// arms against each other (s >= 600, the lane zone / J1 box is shared): ROWs must not overlap
P('\nARMS AGAINST EACH OTHER (s >= 600 on both): smallest centreline distance');
const ids = ARMS.map((a) => a.id);
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  let d = 1e9, sa = 0, sb = 0;
  for (const p of all[ids[i]].rows) if (p.s >= 600) for (const q of all[ids[j]].rows) if (q.s >= 600) { const dd = Math.hypot(p.x - q.x, p.z - q.z); if (dd < d) { d = dd; sa = p.s; sb = q.s; } }
  CHK(`${ids[i]} x ${ids[j]}: centrelines at least ${ARM_GAP} m apart (two ROWs)`, d >= ARM_GAP, `${f0(d)} m (s ${f0(sa)} / ${f0(sb)})`);
}
const fails = chk.filter((c) => !c.pass).length;
P(`\nSUMMARY: ${chk.length - fails} PASS, ${fails} FAIL`);
writeFileSync(`${out}/STEP61E_OUTPUT.txt`, lines.join('\n') + '\n');
writeFileSync(`${out}/j1_arms_ground.json`, JSON.stringify({ SJ, ROW, checks: chk, arms: Object.fromEntries(ids.map((id) => [id, { length: all[id].length, structs: all[id].structs }])) }, null, 1));
