// STEP RAIL-B / 3: lower the J1 arm roads at the three "rail over road" crossings E1 (J1-E x north-1), S1 (J1-S x west-nw), W1 (J1-W x west-nw).
// Only HEIGHTS change: the plan (x, z) of the arms, the railway and the rivers are NOT touched. The first part of the PVI table (pad line, tail of the arm) is kept,
// a few PVIs in between are searched again so that the road follows the ground (cut / fill small, no viaduct) and the rail deck is >= 7.0 m over the road.
// Run:  npx tsx scripts/j1-rail-b3-profile.ts docs          (measure + search only)
//       WRITE=1 npx tsx scripts/j1-rail-b3-profile.ts docs  (also rewrites docs/j1c7c|c6c|c5c_profile.json, j1_structures_*.json, src/roads/junction/J1ArmProfiles.ts; then run python3 tools/j1-arm-data.py)
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { minVerticalK } from '../src/roads/standards/Checks';
import { RAIL_DESIGN } from '../src/rail/RailPlan';

const out = process.argv[2] ?? 'docs';
const WRITE = process.env.WRITE === '1';
const K = minVerticalK(100);
const SJ = 340, MINA = 0.005, LMIN = 60, OFF = 25, VIADUCT = 7, CUTMAX = 12, NEED_GAP = 7.0, GAP_WANT = 7.6; // GAP_WANT: 0.6 m margin over the buffer 7.0 m
const RAIL_UNDER = RAIL_DESIGN.ballast + RAIL_DESIGN.deckThick;   // rail top -> underside of the deck
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const ground = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const waterAt = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.water; };
const lines: string[] = []; const P = (s = ''): void => { lines.push(s); console.log(s); };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2), f0 = (v: number): string => v.toFixed(0);

interface Pvi { s: number; y: number; g1: number; g2: number; Lc: number; kind: string }
interface ArmCfg { tag: 'E' | 'S' | 'W'; prof: string; align: string; structFile: string; structKey: string; structId: string; firstFree: number; tailFrom: number; init: number[]; gPad: number; gHill: number; hillEnd: number; edge: string }
// firstFree = index in the old PVI table of the first PVI that is searched again (index 1 = the pad-line PVI, always re-searched); tailFrom = index of the first kept PVI.
const ARMS: ArmCfg[] = [
  { tag: 'E', prof: 'j1c7c_profile.json', align: 'j1c7b_align.json', structFile: 'j1_structures_E.json', structKey: 'E', structId: 'E1', firstFree: 1, tailFrom: 4, init: [80, 560, 19.9], gPad: 0.03, gHill: 0.03, hillEnd: 0, edge: 'north-1' },
  { tag: 'S', prof: 'j1c6c_profile.json', align: 'j1c6b_align.json', structFile: 'j1_structures_S.json', structKey: 'S', structId: 'S1', firstFree: 1, tailFrom: 3, init: [80, 560, 18.6], gPad: 0.03, gHill: 0.03, hillEnd: 0, edge: 'west-nw' },
  { tag: 'W', prof: 'j1c5c_profile.json', align: 'j1c5b_align.json', structFile: 'j1_structures_NW.json', structKey: 'W', structId: 'W1', firstFree: 1, tailFrom: 5, init: [150, 376, 25.11, 679, 37.06, 1001, 31.07], gPad: 0.035, gHill: 0.04, hillEnd: 1000, edge: 'west-nw' },
];

let seed = 11; const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = (): number => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

interface Result { cfg: ArmCfg; oldPvi: Pvi[]; newPvi: Pvi[]; rows: number[][]; crossings: any[]; viaduct: string[]; cutMax: number; cutEdge: number; fillMax: number; fillEdge: number; checks: Array<{ name: string; pass: boolean; detail: string }>; evalEnd: number }
const results: Result[] = [];

for (const cfg of ARMS) {
  P(`===== J1-${cfg.tag} (${cfg.structId}, rail ${cfg.edge}) =====`);
  const A = JSON.parse(readFileSync(`${out}/${cfg.align}`, 'utf8'));
  const PR = JSON.parse(readFileSync(`${out}/${cfg.prof}`, 'utf8'));
  const oldPvi: Pvi[] = PR.pvi;
  const smp = A.samples as number[][];             // [s from S, x, z, headingDeg, k]
  const ENDS = SJ + A.length;
  const hx = smp[1][1] - smp[0][1], hz = smp[1][2] - smp[0][2], hl = Math.hypot(hx, hz);
  // ground samples: lane zone s 60..340 (straight line backwards from S, as tools/j1-arm-data.py) + plan samples
  const sS: number[] = [], xs: number[] = [], zs: number[] = [], hd: number[] = [];
  for (let s = 60; s < SJ; s += 5) { const d = SJ - s; sS.push(s); xs.push(smp[0][1] - (hx / hl) * d); zs.push(smp[0][2] - (hz / hl) * d); hd.push(Math.atan2(hz, hx)); }
  for (const q of smp) { sS.push(SJ + q[0]); xs.push(q[1]); zs.push(q[2]); hd.push((q[3] * Math.PI) / 180); }
  const NS = sS.length;
  const gC = new Float64Array(NS), gL = new Float64Array(NS), gR = new Float64Array(NS), wW = new Float64Array(NS);
  for (let i = 0; i < NS; i++) {
    // q[3] is the heading in degrees as in the c*c scripts: normal = (-sin h, cos h); for the backward samples the heading is the same direction (atan2 form)
    const nx = -Math.sin(hd[i]), nz = Math.cos(hd[i]);
    gC[i] = ground(xs[i], zs[i]); gL[i] = ground(xs[i] + OFF * nx, zs[i] + OFF * nz); gR[i] = ground(xs[i] - OFF * nx, zs[i] - OFF * nz); wW[i] = waterAt(xs[i], zs[i]);
  }
  // rail crossings with the rail design of the game as it is now (rail top)
  const crossings: Array<{ s: number; rail: number; edge: string; x: number; z: number }> = [];
  for (let i = 1; i < smp.length; i++) for (const e of gen.rail.edges) for (let k = 0; k + 1 < e.xs.length; k++) {
    const ax = smp[i - 1][1], az = smp[i - 1][2], bx = smp[i][1], bz = smp[i][2], cx = e.xs[k], cz = e.zs[k], dx = e.xs[k + 1], dz = e.zs[k + 1];
    const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(den) < 1e-9) continue;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) crossings.push({ s: SJ + smp[i - 1][0] + t * (smp[i][0] - smp[i - 1][0]), rail: e.design[k] + (e.design[k + 1] - e.design[k]) * u, edge: e.id, x: ax + t * (bx - ax), z: az + t * (bz - az) });
  }
  P(`  rail crossings on this arm (rail design of the game now): ${crossings.map((c) => `${c.edge} s ${f0(c.s)} rail top ${f2(c.rail)}`).join('; ')}`);
  const target = crossings.find((c) => c.edge === cfg.edge)!;
  const sTail = oldPvi[cfg.tailFrom].s, evalEnd = sTail + 260;

  const g0 = oldPvi[1].g1;                                                  // pad-line grade (first tangent of the old table, kept)
  const limAt = (s: number): number => (s < SJ ? cfg.gPad : s < SJ + cfg.hillEnd ? cfg.gHill : 0.03);
  const toPvi = (v: number[]): Pvi[] => {
    const pts: Array<{ s: number; y: number }> = [{ s: 0, y: oldPvi[0].y }, { s: v[0], y: oldPvi[0].y + g0 * v[0] }];
    const fr: Array<{ s: number; y: number }> = []; for (let k = 1; k + 1 < v.length; k += 2) fr.push({ s: v[k], y: v[k + 1] });
    fr.sort((a, b) => a.s - b.s); pts.push(...fr);
    for (let i = cfg.tailFrom; i < oldPvi.length; i++) pts.push({ s: oldPvi[i].s, y: oldPvi[i].y });
    const pvi: Pvi[] = pts.map((p) => ({ s: p.s, y: p.y, g1: 0, g2: 0, Lc: 0, kind: '' }));
    for (let i = 0; i < pvi.length - 1; i++) pvi[i].g2 = pvi[i + 1].g1 = (pvi[i + 1].y - pvi[i].y) / (pvi[i + 1].s - pvi[i].s);
    for (let i = 1; i < pvi.length - 1; i++) {
      const a = pvi[i].g2 - pvi[i].g1;
      if (Math.abs(a) < MINA) { pvi[i].kind = 'none'; continue; }
      pvi[i].kind = a < 0 ? 'crest' : 'sag';
      pvi[i].Lc = Math.max(LMIN, Math.abs(a) * 100 * (a < 0 ? K.crest : K.sag));
    }
    return pvi;
  };
  const yAt = (pvi: Pvi[], s: number): number => {
    let k = 0; while (k < pvi.length - 2 && s > pvi[k + 1].s) k++;
    for (const j of [k, k + 1]) { const p = pvi[j]; if (p.Lc > 0 && s >= p.s - p.Lc / 2 && s <= p.s + p.Lc / 2) { const x = s - (p.s - p.Lc / 2); return p.y - (p.g1 * p.Lc) / 2 + p.g1 * x + ((p.g2 - p.g1) / (2 * p.Lc)) * x * x; } }
    return pvi[k].y + pvi[k].g2 * (s - pvi[k].s);
  };
  const overlapOf = (pvi: Pvi[]): number => {
    let ex = 0;
    for (let i = 1; i < pvi.length - 2; i++) ex += Math.max(0, pvi[i].Lc / 2 + pvi[i + 1].Lc / 2 + 4 - (pvi[i + 1].s - pvi[i].s)) ** 2;
    ex += Math.max(0, 62 - (pvi[1].s - pvi[1].Lc / 2)) ** 2;                          // first curve not inside the pad (s < 60)
    for (let i = 2; i < pvi.length; i++) ex += Math.max(0, 50 - (pvi[i].s - pvi[i - 1].s)) ** 2 * 0.1;
    return ex;
  };
  const evaluate = (v: number[]): { cost: number; pvi: Pvi[] } => {
    const pvi = toPvi(v); let cost = overlapOf(pvi) * 50;
    for (let i = 1; i + 1 < pvi.length; i++) if (pvi[i].s < pvi[i - 1].s + 1) cost += 1e6;
    let prev = NaN, prevS = NaN;
    for (let i = 0; i < NS; i++) {
      const s = sS[i]; if (s > evalEnd) break;
      const r = yAt(pvi, s), cut = Math.max(0, Math.max(gC[i], gL[i], gR[i]) - r), fill = Math.max(0, r - Math.min(gC[i], gL[i], gR[i]));
      cost += 5 * (0.05 * cut * cut + 0.02 * fill * fill);
      if (gC[i] - r > CUTMAX) cost += 1000 * (gC[i] - r - CUTMAX);
      if (r - gC[i] > VIADUCT - 0.5) cost += 500 * (r - gC[i] - VIADUCT + 0.5) ** 2;       // no viaduct wanted here
      if (!Number.isNaN(prev)) { const g = Math.abs(r - prev) / (s - prevS), ex = g - (limAt(s) - 0.0006); if (ex > 0) cost += 2e4 * (ex * 100) ** 2; }
      prev = r; prevS = s;
      if (!Number.isNaN(wW[i]) && gC[i] < wW[i] - 0.05 && r - wW[i] < 3) cost += 500 * (3 - (r - wW[i])) ** 2;
    }
    for (const c of crossings) { if (c.s > evalEnd) continue; const r = yAt(pvi, c.s), under = c.rail - RAIL_UNDER; if (r > under - GAP_WANT) cost += 3e3 * (r - (under - GAP_WANT)) ** 2; }
    const g0n = (pvi[2].y - pvi[1].y) / (pvi[2].s - pvi[1].s); if (Math.abs(g0n) < 0.003) cost += 1e4 * (0.003 - Math.abs(g0n)) ** 2 * 1e4;
    return { cost, pvi };
  };
  // ---- annealing (several restarts)
  let best = { cost: Infinity, v: cfg.init.slice() };
  for (let rs = 0; rs < 6; rs++) {
    let v = cfg.init.map((x, k) => (rs === 0 ? x : x + (k % 2 === 0 ? 25 : 1.2) * gauss() * (k === 0 ? 0.4 : 1)));
    if (rs > 0) v[0] = Math.max(64, Math.min(200, v[0]));
    let cur = evaluate(v).cost, T = 40;
    for (let it = 0; it < 14000; it++) {
      T = 40 * Math.pow(0.0005, it / 14000);
      const v2 = v.slice(); const k = Math.floor(rnd() * v2.length); v2[k] += gauss() * (k === 0 || k % 2 === 1 ? 14 : 0.5) * (0.2 + T / 40);
      if (v2[0] < 62 || v2[0] > 260) continue;
      const c2 = evaluate(v2).cost;
      if (c2 < cur || rnd() < Math.exp((cur - c2) / T)) { v = v2; cur = c2; if (cur < best.cost) best = { cost: cur, v: v.slice() }; }
    }
  }
  const newPvi = toPvi(best.v);
  P(`  best cost ${f1(best.cost)}; PVIs (s, level, curve): ${newPvi.slice(0, cfg.tailFrom + 2 > newPvi.length ? newPvi.length : newPvi.length).filter((p) => p.s <= evalEnd + 150).map((p) => `${f0(p.s)} (${f2(p.y)}, ${f0(p.Lc)})`).join(' | ')}`);
  P(`  OLD  PVIs: ${oldPvi.filter((p) => p.s <= evalEnd + 150).map((p) => `${f0(p.s)} (${f2(p.y)}, ${f0(p.Lc)})`).join(' | ')}`);

  // ---- rows for the whole arm (every 5 m) = the old rows with the new level; the tail must be identical to the old rows
  const rows: number[][] = PR.rows.map((r: number[]) => [r[0], r[1], Math.round(yAt(newPvi, r[0]) * 100) / 100]);
  let maxTail = 0; for (let i = 0; i < rows.length; i++) if (rows[i][0] > evalEnd + 40) maxTail = Math.max(maxTail, Math.abs(rows[i][2] - PR.rows[i][2]));
  // ---- checks
  const chk: Result['checks'] = [];
  const CHK = (name: string, pass: boolean, detail: string): void => { chk.push({ name, pass, detail }); P(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(70)} ${detail}`); };
  CHK('tail of the arm (s > end of the changed part + 40 m) is the same as before', maxTail < 0.03, `max difference ${f2(maxTail)} m`);
  let gMax = 0, gOver = 0; for (let s = 65; s <= evalEnd; s += 5) { const g = Math.abs(yAt(newPvi, s) - yAt(newPvi, s - 5)) / 5; gMax = Math.max(gMax, g); if (g > limAt(s) + 1e-4) gOver++; }
  CHK(`grade within the arm limits (pad stretch ${f1(cfg.gPad * 100)} %, hill ${f1(cfg.gHill * 100)} % to s ${SJ + cfg.hillEnd}, 3 % beyond)`, gOver === 0, `max grade ${f2(gMax * 100)} % (s 65..${f0(evalEnd)})`);
  const cur = newPvi.filter((p) => p.Lc > 0);
  CHK('every vertical curve K >= minimum (crest / sag) and length >= 60 m', cur.every((p) => p.Lc / (Math.abs(p.g2 - p.g1) * 100) >= (p.kind === 'crest' ? K.crest : K.sag) - 1e-6 && p.Lc >= LMIN - 1e-6), `${cur.length} curves`);
  let ovN = 0; for (let i = 1; i < newPvi.length - 2; i++) if (newPvi[i].Lc / 2 + newPvi[i + 1].Lc / 2 > newPvi[i + 1].s - newPvi[i].s) ovN++;
  CHK('vertical curves do not overlap', ovN === 0, `${ovN} overlaps`);
  CHK('first curve starts at s >= 60 (pad plane kept)', cur.every((p) => p.s - p.Lc / 2 >= 59.5), `first curve starts at s ${f0(Math.min(...cur.map((p) => p.s - p.Lc / 2)))}`);
  let cutMax = 0, cutEdge = 0, fillMax = 0, fillEdge = 0, c12 = 0, via = 0, wetMin = Infinity;
  for (let i = 0; i < NS; i++) { const s = sS[i], r = yAt(newPvi, s); cutMax = Math.max(cutMax, gC[i] - r); fillMax = Math.max(fillMax, r - gC[i]); cutEdge = Math.max(cutEdge, gL[i] - r, gR[i] - r); fillEdge = Math.max(fillEdge, r - gL[i], r - gR[i]); if (s <= evalEnd) { if (gC[i] - r > CUTMAX) c12++; if (s <= sTail && r - gC[i] > VIADUCT) via++; if (!Number.isNaN(wW[i]) && gC[i] < wW[i] - 0.05) wetMin = Math.min(wetMin, r - wW[i]); } }
  CHK('centre cut <= 12 m in the changed part', c12 === 0, `max cut ${f1(cutMax)} m (old arm ${f1(PR.cutMax)} m)`);
  CHK('no fill > 7 m (no viaduct) before the first kept PVI of the old table', via === 0, `max fill in the changed part ${f1(Math.max(...sS.map((s, i) => (s <= sTail ? yAt(newPvi, s) - gC[i] : -99))))} m`);
  if (Number.isFinite(wetMin)) CHK('river: road >= 2.5 m over the water in the changed part', wetMin >= 2.5, `${f1(wetMin)} m`);
  const cross = crossings.map((c) => { const road = yAt(newPvi, c.s), under = c.rail - RAIL_UNDER, ground0 = ground(c.x, c.z); const oldRoad = yAt(oldPvi, c.s); return { s: c.s, edge: c.edge, rail: c.rail, road, oldRoad, ground: ground0, gap: road - c.rail, kind: road < under ? 'rail-over-road' : 'road-over-rail', gapUnder: under - road }; });
  for (const c of cross) {
    if (c.edge === cfg.edge) CHK(`${c.edge} at s ${f0(c.s)}: rail over road, deck underside >= ${NEED_GAP} m over the road`, c.gapUnder >= NEED_GAP, `road ${f2(c.road)} m (was ${f2(c.oldRoad)}), ground ${f2(c.ground)} m, rail top ${f2(c.rail)} m, gap ${f2(c.gapUnder)} m (was ${f2(c.rail - RAIL_UNDER - c.oldRoad)})`);
    else P(`  INFO  other crossing ${c.edge} at s ${f0(c.s)}: road ${f2(c.road)} m (was ${f2(c.oldRoad)})`);
  }
  const runs: string[] = []; { let a = -1; for (let i = 0; i <= rows.length; i++) { const on = i < rows.length && rows[i][2] - rows[i][1] > VIADUCT; if (on && a < 0) a = i; if (!on && a >= 0) { runs.push(`s ${f0(rows[a][0])}..${f0(rows[i - 1][0])} (max fill ${f1(Math.max(...rows.slice(a, i).map((r) => r[2] - r[1])))} m)`); a = -1; } } }
  P(`  INFO  viaduct runs now (fill > ${VIADUCT} m): ${runs.join('; ') || '-'}`);
  P(`  INFO  viaduct runs before:   ${(PR.viaduct as string[]).join('; ') || '-'}`);
  results.push({ cfg, oldPvi, newPvi, rows, crossings: cross, viaduct: runs, cutMax, cutEdge, fillMax, fillEdge, checks: chk, evalEnd });
}
const total = results.flatMap((r) => r.checks), fails = total.filter((c) => !c.pass).length;
P(`SUMMARY: ${total.length - fails} PASS, ${fails} FAIL (only the checks of this script; the game checks must be run separately)`);

if (WRITE) {
  if (fails > 0) { P('WRITE refused: there are FAIL lines'); process.exit(1); }
  for (const R of results) {
    const c = R.cfg, PR = JSON.parse(readFileSync(`${out}/${c.prof}`, 'utf8'));
    // only the lowered crossing (E1 / S1 / W1) gets the new numbers (the rail height of the game now); the other crossings keep the entries of 6.1d / 6.1e
    const crossOut = (PR.crossings as any[]).map((o) => { const x = R.crossings.find((q) => q.edge === o.edge && Math.abs(q.s - o.s) < 25); return x && x.edge === c.edge ? { s: x.s, rail: x.rail, edge: x.edge, road: x.road, gap: x.gap } : o; });
    writeFileSync(`${out}/${c.prof}`, JSON.stringify({ ...PR, pvi: R.newPvi, crossings: crossOut, viaduct: R.viaduct, cutMax: R.cutMax, cutEdge: R.cutEdge, fillMax: R.fillMax, fillEdge: R.fillEdge, railB3: { note: `RAIL-B STEP 3: ${c.structId} road lowered, only heights changed`, checks: R.checks }, rows: R.rows }));
    const SF = JSON.parse(readFileSync(`${out}/${c.structFile}`, 'utf8'));
    SF[c.structKey].structures = SF[c.structKey].structures.filter((q: any) => q.id !== c.structId);
    writeFileSync(`${out}/${c.structFile}`, JSON.stringify(SF));
  }
  // src/roads/junction/J1ArmProfiles.ts: replace the tables of E, S, W
  let ts = readFileSync('src/roads/junction/J1ArmProfiles.ts', 'utf8');
  for (const R of results) {
    const block = `${R.cfg.tag}: [\n` + R.newPvi.map((p) => `    { s: ${+p.s.toFixed(3)}, y: ${+p.y.toFixed(4)}, g1: ${+p.g1.toFixed(6)}, g2: ${+p.g2.toFixed(6)}, Lc: ${+p.Lc.toFixed(3)} },`).join('\n') + '\n  ],';
    const re = new RegExp(`( ?${R.cfg.tag}: \\[)[\\s\\S]*?\\n {1,2}\\],`);
    if (!re.test(ts)) throw new Error('table not found: ' + R.cfg.tag);
    ts = ts.replace(re, (m, a) => (a.startsWith(' ') && !a.startsWith('  ') ? ' ' : '  ') + block);
  }
  writeFileSync('src/roads/junction/J1ArmProfiles.ts', ts);
  P('written: profile json (E, S, W), structures json, J1ArmProfiles.ts. Next: python3 tools/j1-arm-data.py');
}
writeFileSync(`${out}/STEPRAILB3_OUTPUT.txt`, lines.join('\n') + '\n');
