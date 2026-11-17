// STEP 6.1d (headless): STRUCTURES LIST of the S arm of J1 (c6b / c6c) (rail bridges, river bridges, viaducts). Data only, no mesh.
// Run: npx tsx scripts/j1-structures-s.ts docs     needs docs/j1c6b_align.json + j1c6c_profile.json; writes docs/j1_structures_S.json + docs/STEP61D_S_OUTPUT.txt
// Same rules as the ring (RoadNetwork.bridgeRing / STRUCT): a stretch is a structure when the centreline is WET (every river crossing, no dam), when the road is more than 7 m above the ground (D4 viaduct),
// or where the road passes OVER a rail line (X5, the whole rail corridor is spanned). Each structure gets a 16 m approach slab at both ends (STRUCT.approach), neighbouring ones are merged when the gap is <= 15 m.
// Spans are a PROPOSAL (marked): rail span = corridor 24 m / sin(angle), river main span = wet length + 2 x 15 m bank set-back, rest standard spans 40 m (50 m above 15 m height).
import { RAIL_DESIGN } from '../src/rail/RailPlan';
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { STRUCT } from '../src/roads/ring/RingStructures';

const out = process.argv[2] ?? 'docs';
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const waterAt = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.water; };

const RAIL_UNDER = RAIL_DESIGN.ballast + RAIL_DESIGN.deckThick;   // rail top -> deck underside
const LANE_END = 269, SJ = 340, VIADUCT = 7, MERGE_GAP = 15, RAIL_CORRIDOR = 24, BANK = 15, SPAN_STD = 40, SPAN_TALL = 50, TALL = 15, SPAN_VTALL = 75, VTALL = 35, RAIL_CLR = 7.4, MIN_WATER_CLR = 2.5, NEAR_END = 150, RMIN_BRIDGE = 591;
const lines: string[] = []; const P = (s = ''): void => { lines.push(s); console.log(s); };
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const chk: Array<{ name: string; pass: boolean; detail: string }> = [];
const CHK = (name: string, pass: boolean, detail: string): void => { chk.push({ name, pass, detail }); P(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(74)} ${detail}`); };

interface Row { s: number; g: number; r: number; x: number; z: number; h: number; k: number; w: number }
interface Struct {
  id: string; arm: string; kinds: string[]; s0: number; s1: number; length: number; x0: number; z0: number; x1: number; z1: number; xm: number; zm: number;
  maxHeight: number; maxCarve: number; waterLen: number; waterLevel: number | null; riverClear: number | null; rail: Array<{ edge: string; s: number; angle: number; gap: number; span: number }>;
  specialSpans: number[]; stdSpans: number; spanTotal: number; piers: number; maxPier: number; maxCurvatureOn: number; hCurveOnStruct: boolean; vCurvesOn: number; fromArmEnd: number; proposal: string; why: string; interchange?: boolean;
}

function loadArm(tag: string, alignFile: string, profFile: string): { rows: Row[]; prof: any; align: any } {
  const align = JSON.parse(readFileSync(`${out}/${alignFile}`, 'utf8')), prof = JSON.parse(readFileSync(`${out}/${profFile}`, 'utf8'));
  const smp = align.samples as number[][], pr = prof.rows as number[][];
  if (smp.length !== pr.length) throw new Error(`${tag}: ${smp.length} plan samples but ${pr.length} profile rows`);
  const rows: Row[] = pr.map((q, i) => ({ s: q[0], g: q[1], r: q[2], x: smp[i][1], z: smp[i][2], h: smp[i][3], k: smp[i][4], w: waterAt(smp[i][1], smp[i][2]) }));
  rows.forEach((r, i) => { if (Math.abs(r.s - (SJ + smp[i][0])) > 0.2) throw new Error(`${tag}: row ${i} station mismatch ${r.s} vs ${SJ + smp[i][0]}`); });
  return { rows, prof, align };
}
const at = (rows: Row[], s: number): Row => { const i = Math.max(0, Math.min(rows.length - 2, Math.floor((s - rows[0].s) / 5))); const t = Math.max(0, Math.min(1, (s - rows[i].s) / (rows[i + 1].s - rows[i].s))); const a = rows[i], b = rows[i + 1]; return { s, g: a.g + (b.g - a.g) * t, r: a.r + (b.r - a.r) * t, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: a.h, k: a.k, w: a.w }; };

// angle (deg, 0..90) between the road and the rail line at a crossing near station s
function crossAngle(rows: Row[], c: { s: number; edge: string }): number {
  const p = at(rows, c.s), q = at(rows, c.s + 2), hx = q.x - p.x, hz = q.z - p.z, hl = Math.hypot(hx, hz);
  let best = 90, bd = 1e9;
  for (const e of gen.rail.edges) if (e.id === c.edge) for (let k = 0; k + 1 < e.xs.length; k++) {
    const mx = (e.xs[k] + e.xs[k + 1]) / 2, mz = (e.zs[k] + e.zs[k + 1]) / 2, d = Math.hypot(mx - p.x, mz - p.z);
    if (d < bd) { bd = d; const dx = e.xs[k + 1] - e.xs[k], dz = e.zs[k + 1] - e.zs[k]; const cs = Math.abs(hx * dx + hz * dz) / (hl * Math.hypot(dx, dz)); best = (Math.acos(Math.min(1, cs)) * 180) / Math.PI; }
  }
  return best;
}

function arm(tag: string, label: string, alignFile: string, profFile: string): { list: Struct[]; rows: Row[]; length: number; railOver: Array<{ s: number; edge: string; gap: number }> } {
  const { rows, prof, align } = loadArm(tag, alignFile, profFile);
  const ENDS = SJ + (align.length as number);
  // 1) flags per 5 m row
  interface Zone { a: number; b: number; wet: boolean; via: boolean; rail: typeof prof.crossings }
  const zr: Array<{ a: number; b: number; wet: boolean; via: boolean; rail: any[] }> = [];
  const flagged: Array<{ s: number; wet: boolean; via: boolean }> = [];
  rows.forEach((r) => { const wet = !Number.isNaN(r.w) && r.g < r.w + 0.3 && r.g > 2; const via = r.r - r.g > VIADUCT; if (wet || via) flagged.push({ s: r.s, wet, via }); });
  // RAIL-B STEP 3: a crossing where the rail passes OVER the lowered road needs no road structure (the rail bridge is the structure); it is only checked (rail deck underside >= 7.0 m over the road)
  const crossAll = (prof.crossings as Array<{ s: number; rail: number; edge: string; road: number; gap: number }>).map((c) => { const ang = crossAngle(rows, c); const span = Math.ceil(RAIL_CORRIDOR / Math.sin((Math.max(ang, 20) * Math.PI) / 180) / 5) * 5; return { ...c, angle: ang, span }; });
  const railOver = crossAll.filter((c) => c.gap < 0);
  const cross = crossAll.filter((c) => c.gap >= 0);
  const parts: Array<{ a: number; b: number; wet: boolean; via: boolean; rail: typeof cross }> = [];
  for (const f of flagged) {
    const a = f.s - 5 / 2 - STRUCT.approach, b = f.s + 5 / 2 + STRUCT.approach, last = parts[parts.length - 1];
    if (last && a - last.b <= MERGE_GAP) { last.b = Math.max(last.b, b); last.wet ||= f.wet; last.via ||= f.via; } else parts.push({ a, b, wet: f.wet, via: f.via, rail: [] });
  }
  for (const c of cross) {
    const a = c.s - c.span / 2 - STRUCT.approach, b = c.s + c.span / 2 + STRUCT.approach;
    const hit = parts.find((p) => a <= p.b + MERGE_GAP && b >= p.a - MERGE_GAP);
    if (hit) { hit.a = Math.min(hit.a, a); hit.b = Math.max(hit.b, b); hit.rail.push(c); } else parts.push({ a, b, wet: false, via: false, rail: [c] });
  }
  parts.sort((p, q) => p.a - q.a);
  for (const p of parts) p.b = Math.min(p.b, ENDS + 2.5);   // the end slab stops at the T (the ring carries on)
  for (let i = 1; i < parts.length; i++) if (parts[i].a - parts[i - 1].b <= MERGE_GAP) { const q = parts.splice(i, 1)[0]; const p = parts[i - 1]; p.b = Math.max(p.b, q.b); p.wet ||= q.wet; p.via ||= q.via; p.rail.push(...q.rail); i--; }
  // 2) data per structure
  const list: Struct[] = parts.map((p, n) => {
    const id = `${tag}${n + 1}`, inside = rows.filter((r) => r.s >= p.a && r.s <= p.b);
    const maxH = Math.max(...inside.map((r) => r.r - r.g)), carve = Math.max(0, ...inside.map((r) => r.g - (r.r - STRUCT.deckDepth - STRUCT.groundGap)));   // ground that stands above the slab underside and is carved away under it (ring rule)
    const wetRows = inside.filter((r) => !Number.isNaN(r.w) && r.g < r.w + 0.3 && r.g > 2);
    const waterLen = wetRows.length * 5, waterLevel = wetRows.length ? Math.max(...wetRows.map((r) => r.w)) : null;
    const riverClear = wetRows.length ? Math.min(...wetRows.map((r) => r.r - r.w)) : null;
    const kinds: string[] = []; if (p.rail.length) kinds.push('rail bridge'); if (p.wet) kinds.push('river bridge'); if (p.via) kinds.push('viaduct');
    const length = p.b - p.a, free = length - 2 * STRUCT.approach;
    const special: number[] = []; for (const c of p.rail) special.push(c.span); if (waterLen > 0) special.push(Math.ceil((waterLen + 2 * BANK) / 5) * 5);
    const std = maxH > VTALL ? SPAN_VTALL : maxH > TALL ? SPAN_TALL : SPAN_STD, rest = Math.max(0, free - special.reduce((a, b) => a + b, 0)), nStd = rest > 0 ? Math.ceil(rest / std) : 0;
    const spanTotal = special.reduce((a, b) => a + b, 0) + nStd * std, piers = special.length + nStd - 1;
    const kMax = Math.max(...inside.map((r) => Math.abs(r.k))), curved = kMax > 1e-6;
    const vOn = (prof.pvi as Array<{ s: number; Lc: number }>).filter((v) => v.Lc > 0 && v.s + v.Lc / 2 >= p.a && v.s - v.Lc / 2 <= p.b).length;
    const m = at(rows, (p.a + p.b) / 2), A = at(rows, p.a), B = at(rows, p.b);
    return {
      id, arm: label, kinds, s0: p.a, s1: p.b, length, x0: A.x, z0: A.z, x1: B.x, z1: B.z, xm: m.x, zm: m.z, maxHeight: maxH, maxCarve: carve, waterLen, waterLevel, riverClear,
      rail: p.rail.map((c) => ({ edge: c.edge, s: c.s, angle: c.angle, gap: c.gap, span: c.span })), specialSpans: special, stdSpans: nStd, spanTotal, piers, maxPier: Math.max(0, maxH - STRUCT.deckDepth),
      maxCurvatureOn: kMax, hCurveOnStruct: curved, vCurvesOn: vOn, fromArmEnd: ENDS - p.b, proposal: '', why: '',
    };
  });
  return { list, rows, length: ENDS, railOver };
}

const S = arm('S', 'S arm', 'j1c6b_align.json', 'j1c6c_profile.json');

// design proposal: every structure engineered and DIFFERENT (user decision 2026-11-13), not repeating the ring's S1 cable-stayed, S2 arch, S3 extradosed, S4 bowstring, S5 / S6 box-girder viaducts
const PROPOSAL: Record<string, [string, string]> = {};
const assign = (id: string, t: string, why: string): void => { PROPOSAL[id] = [t, why]; };
{
  const all = [...S.list];
  for (const s of all) {
    const rail = s.kinds.includes('rail bridge'), river = s.kinds.includes('river bridge');
    if (s.maxHeight > VTALL) assign(s.id, 'balanced-cantilever segmental concrete box girder, tall hollow rectangular piers, 75 m spans, river and rail spanned inside it', `${f0(s.length)} m long, up to ${f1(s.maxHeight)} m high: approach to the ring level, river main span about ${f0(s.specialSpans[s.specialSpans.length - 1])} m`);
    else if (river) assign(s.id, 'haunched steel box girder, slender V-shaped piers', `river main span about ${f0(s.specialSpans[s.specialSpans.length - 1])} m, deck ${f0(s.maxHeight)} m above ground`);
    else if (rail && s.kinds.length === 1) assign(s.id, 'single-span skewed steel box girder, integral abutments', `rail corridor span ${f0(s.specialSpans[0])} m, short bridge`);
    else if (rail) assign(s.id, 'segmental concrete box viaduct, one long span over the rail', `rail span ${f0(s.specialSpans[0])} m inside a ${f0(s.length)} m viaduct`);
    else assign(s.id, 'precast concrete viaduct, slender twin-blade piers', `${f0(s.length)} m long, up to ${f1(s.maxHeight)} m high, standard spans`);
  }
  // keep the designs different from each other: second and later structures of the same proposed type get a named variant
  const seen: Record<string, number> = {};
  for (const s of all) { const t = PROPOSAL[s.id][0]; seen[t] = (seen[t] ?? 0) + 1; if (seen[t] > 1) PROPOSAL[s.id][0] = t + ` (variant ${seen[t]}: different pier shape and parapet)`; }
  for (const s of all) { s.proposal = PROPOSAL[s.id][0]; s.why = PROPOSAL[s.id][1]; }
}

for (const A of [S]) {
  P(`S ARM STRUCTURES (s = 0 at the J1 centre, arm from S = ${SJ} to the ring T = ${f0(A.length)}), approach slab ${STRUCT.approach} m each end, deck depth ${STRUCT.deckDepth} m`);
  P('  id   kinds                          s0..s1 (m)      length  max height  max carve  wet  river clear  rail (angle, gap, span)  spans (special + std x m)  piers  max pier  from arm end');
  for (const s of A.list) {
    const rl = s.rail.map((c) => `${c.edge} ${f0(c.angle)} deg, gap ${f2(c.gap)}, span ${f0(c.span)}`).join(' | ') || '-';
    P(`  ${s.id.padEnd(4)} ${s.kinds.join(' + ').padEnd(30)} ${f0(s.s0).padStart(5)}..${f0(s.s1).padEnd(6)} ${f0(s.length).padStart(6)}  ${f1(s.maxHeight).padStart(9)}  ${f1(s.maxCarve).padStart(9)}  ${f0(s.waterLen).padStart(3)}  ${(s.riverClear === null ? '-' : f1(s.riverClear)).padStart(11)}  ${rl.padEnd(40)} ${s.specialSpans.join('+') || '0'} + ${s.stdSpans} x ${s.maxHeight > VTALL ? SPAN_VTALL : s.maxHeight > TALL ? SPAN_TALL : SPAN_STD}  ${String(s.piers).padStart(5)}  ${f1(s.maxPier).padStart(8)}  ${f0(s.fromArmEnd).padStart(6)}`);
  }
  P(`  total structure length ${f0(A.list.reduce((a, s) => a + s.length, 0))} m of ${f0(A.length - SJ)} m arm (${f1((100 * A.list.reduce((a, s) => a + s.length, 0)) / (A.length - SJ))} %)`);
  P();
}

P('PROPOSED DESIGNS (types wait for the user OK, every structure different, none repeats the ring S1-S6):');
for (const s of [...S.list]) P(`  ${s.id}  ${s.kinds.join(' + ')}: ${s.proposal}  (${s.why})`);
P();

// ---------------------------------------------------------------- checks
for (const [A, nm] of [[S, 'S']] as const) {
  const inS = (s: number): Struct | undefined => A.list.find((q) => s >= q.s0 && s <= q.s1);
  const wetOut = A.rows.filter((r) => !Number.isNaN(r.w) && r.g < r.w + 0.3 && r.g > 2 && !inS(r.s)).length;
  CHK(`${nm}: every wet point is inside a structure (no dam across water)`, wetOut === 0, `${wetOut * 5} m of wet centreline outside`);
  const viaOut = A.rows.filter((r) => r.r - r.g > VIADUCT && !inS(r.s)).length;
  CHK(`${nm}: every point with fill > ${VIADUCT} m is inside a viaduct (D4)`, viaOut === 0, `${viaOut * 5} m outside`);
  const rails = A.list.flatMap((s) => s.rail.map((c) => ({ s, c })));
  CHK(`${nm}: every rail crossing lies in a structure that spans the whole corridor + approach (X5)`, rails.every(({ s, c }) => c.s - c.span / 2 >= s.s0 + STRUCT.approach - 0.01 && c.s + c.span / 2 <= s.s1 - STRUCT.approach + 0.01), `${rails.length} crossings: ${rails.map(({ s, c }) => `${s.id}/${c.edge} s ${f0(c.s)}`).join(', ') || '-'}`);
  CHK(`${nm}: rail over road (no road structure): rail deck underside >= 7.0 m over the road`, A.railOver.every((c) => -c.gap - RAIL_UNDER >= 7.0), A.railOver.map((c) => `${c.edge} s ${f0(c.s)}: ${f2(-c.gap - RAIL_UNDER)} m`).join(', ') || '-');
  CHK(`${nm}: road over rail >= ${RAIL_CLR} m on every rail crossing`, rails.every(({ c }) => c.gap >= RAIL_CLR), rails.map(({ c }) => `${f2(c.gap)} m`).join(', ') || '-');
  CHK(`${nm}: river crossings: road at least ${MIN_WATER_CLR} m above the water`, A.list.every((s) => s.riverClear === null || s.riverClear >= MIN_WATER_CLR), A.list.filter((s) => s.riverClear !== null).map((s) => `${s.id} ${f1(s.riverClear!)} m`).join(', ') || 'no river');
  CHK(`${nm}: structures do not overlap and start after the J1 lane zone (s >= ${LANE_END}, J1-b)`, A.list.every((s, i) => s.s0 >= LANE_END - 0.01 && (i === 0 || s.s0 > A.list[i - 1].s1)), `${A.list.length} structures, first starts at s ${f0(A.list[0]?.s0 ?? 0)}`);
  if ((A.list[0]?.s0 ?? SJ) < SJ) P(`  INFO  ${nm}: ${A.list[0].id} starts ${f0(SJ - A.list[0].s0)} m before the arm start s = ${SJ} (its 16 m approach slab; the road level there comes from the PVI table, the 5 m rows start at s ${SJ}); lane zone ends at s ${LANE_END}, so ${f0(A.list[0].s0 - LANE_END)} m remain between them`);
}
// horizontal / vertical coordination (3.12 rule 8, 3.3)
for (const [A, nm] of [[S, 'S']] as const) {
  const bad = A.list.filter((s) => s.hCurveOnStruct && 1 / s.maxCurvatureOn < RMIN_BRIDGE - 1);
  CHK(`${nm}: no structure on a horizontal curve tighter than ${RMIN_BRIDGE} m (rule 3.12.8)`, bad.length === 0, bad.map((s) => `${s.id} R ${f0(1 / s.maxCurvatureOn)}`).join(', ') || 'none');
  const withCurve = A.list.filter((s) => s.hCurveOnStruct);
  P(`  INFO  ${nm}: structures that lie partly on a bend (R >= ${RMIN_BRIDGE} m, allowed, listed for the mesh): ${withCurve.map((s) => `${s.id} (R ${f0(1 / s.maxCurvatureOn)})`).join(', ') || 'none'}`);
  const vc = A.list.filter((s) => s.vCurvesOn > 0);
  P(`  INFO  ${nm}: structures with vertical curves on the deck: ${vc.map((s) => `${s.id} (${s.vCurvesOn})`).join(', ') || 'none'} (a parabola on a deck is normal, joints are placed by the bridge design)`);
}
// the T on the ring (S arm joins the ring S straight at st 1205). A structure within NEAR_END of the T would have to be part of the S ring interchange (9.2): report it.
{
  const last = S.list[S.list.length - 1], endRow = S.rows[S.rows.length - 1], fillEnd = endRow.r - endRow.g;
  if (last && last.fromArmEnd < NEAR_END) last.interchange = true;
  CHK(`S: no structure inside the last ${NEAR_END} m before the ring T, or it is marked as part of the ring interchange`, !last || last.fromArmEnd >= NEAR_END || !!last.interchange, `last structure ${last?.id} ends ${f0(last?.fromArmEnd ?? 0)} m before the ring, fill at the end ${f1(fillEnd)} m`);
  const via = S.list.filter((s) => s.kinds.includes('viaduct')).reduce((a, s) => a + s.length, 0);
  P(`  INFO  S viaduct-type structures ${f0(via)} m in total; free embankment between the last structure and the ring: ${f0(last?.fromArmEnd ?? 0)} m`);
  // the two nearest structures (west-sw rail and the river, about 100 m apart in c6c): list the gap so the user can decide one long structure
  const run = S.list.filter((q) => q.s0 >= 970 && q.s1 <= 1542); if (run.length === 3) P(`  INFO  S2 + S3 + S4 could be ONE structure: s ${f0(run[0].s0)}-${f0(run[2].s1)} = ${f0(run[2].s1 - run[0].s0)} m with only ${f0(run[1].s0 - run[0].s1)} m and ${f0(run[2].s0 - run[1].s1)} m of embankment between them (user decision, like N2 / N3)`);
  for (let i = 1; i < S.list.length; i++) P(`  INFO  gap between ${S.list[i - 1].id} and ${S.list[i].id}: ${f0(S.list[i].s0 - S.list[i - 1].s1)} m of embankment`);
}
const fails = chk.filter((c) => !c.pass).length;
P(`SUMMARY: ${chk.length - fails} PASS, ${fails} FAIL`);
writeFileSync(`${out}/STEP61D_S_OUTPUT.txt`, lines.join('\n') + '\n');
writeFileSync(`${out}/j1_structures_S.json`, JSON.stringify({ SJ, STRUCT, S: { length: S.length, structures: S.list }, checks: chk }, null, 1));
