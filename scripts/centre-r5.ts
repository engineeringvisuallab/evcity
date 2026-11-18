// STEP B2 (21.41): R5 TAP SPACING RECHECK on the fitted + joined lines (headless, READ ONLY; changes NO src file and NO data file, writes only docs/STEP_B2_OUTPUT.txt and docs/centre_r5.json).
// Why: 21.1 measured R5 on the user's DRAWN lines; since then the lines were cut back (21.3), fitted (21.24 - 21.38, ends of R6-15 / R6-11 / R6-12 slid) and joined (B3 21.40).
// Reads: docs/fit_chain/centre_fixed.json (fitted lines + built / 8-lane lines), docs/centre_fixed.json (the drawn / 21.3 lines, for the before / after), docs/a3_demand_x2.json (the 11 known taps).
// RULES CHECKED (HARD RULES R5, user decision 21.7 point 4 and 5):
//   R5a  nothing but an 8-lane road touches an 8-lane road, except R6 / R4 lines at a tap: a line of class R2 / C / L with an end within TOUCH m of an 8-lane road is a FAIL.
//   R5b  no line ends at J1 (plaza edge) and none leaves a ring x arm join (an 8-lane road meeting another 8-lane road): a touch within JOIN_MIN m of a join is a FAIL.
//   R5c  a touch is at least 600 m from the J1 plaza edge.
//   R5d  tap spacing: every touch of an R6 / R4 line on an 8-lane road is at least 1600 m from every known tap, every join and every other touch (straight-line distance as in 21.1, the along-road distance is never smaller).
// A touch that lies within TAP_SNAP m of a known tap IS that tap (the planned node on the M8). A conflict is a LIST for the user (R10: his lines come first), the script moves nothing.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-r5.ts docs
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';

const OUT = process.argv[2] ?? 'docs';
const RB = !!process.env.RULE_B;   // B2c (21.43): decision B, every drawn node on an 8-lane road is a tap itself; limits = smallest values of the drawing (env R5_SPACING / R5_JOIN / R5_J1)
const TOUCH = 12, TAP_SNAP = 60, JOIN_MIN = Number(process.env.R5_JOIN ?? 600), J1_MIN = Number(process.env.R5_J1 ?? 600), SPACING = Number(process.env.R5_SPACING ?? 1600);
const hyp = Math.hypot, f0 = (v: number): string => v.toFixed(0);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

interface Line { id: string; cls: string; built: boolean; dropped: boolean; pts: number[][] }
const load = (p: string): Line[] => (JSON.parse(readFileSync(p, 'utf8')).lines as any[]).map((l) => ({ id: l.id, cls: String(l.cls), built: !!l.built, dropped: !!l.dropped, pts: l.pts }));
function proj(pts: number[][], x: number, z: number): { d: number; p: number[] } {
  let best = { d: Infinity, p: [0, 0] };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, s2 = dx * dx + dz * dz;
    const t = s2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / s2));
    const px = ax + t * dx, pz = az + t * dz, d = hyp(x - px, z - pz);
    if (d < best.d) best = { d, p: [px, pz] };
  }
  return best;
}
const J1 = { x: Config.roads.junctionJ1.x, z: Config.roads.junctionJ1.z, r: Config.roads.junctionJ1.rCore };
const A3 = JSON.parse(readFileSync(`${OUT}/a3_demand_x2.json`, 'utf8'));
const TAPS = ['T7299', 'T8919', 'T13738', 'T18838', 'T-N880', 'T-E610', 'T-W960', 'R1205', 'R4265', 'R12094', 'R16813'];
const taps = A3.nodes.filter((n: any) => TAPS.includes(n.id)).map((n: any) => ({ id: n.id, x: n.x, z: n.z }));

interface Touch { line: string; cls: string; end: 'S' | 'E'; x: number; z: number; on: string; d8: number; dJ1: number; tap: string; tapD: number; joinD: number; other: string; otherD: number; flags: string[]; slid: boolean }
const SLID = ['R6-15|S', 'R6-15|E', 'R6-11|E', 'R6-12|E'];   // the ends that the fit slid (21.25) and that 21.25 / 21.38 left for this recheck
function run(lines: Line[], title: string): { touches: Touch[]; joins: { x: number; z: number; ids: string }[] } {
  const eight = lines.filter((l) => l.cls === '8' && !l.dropped);
  // joins: ends of an 8-lane line that lie on another 8-lane line (ring x arm), de-duplicated within 50 m
  const joins: { x: number; z: number; ids: string }[] = [];
  for (const a of eight) for (const e of [a.pts[0], a.pts[a.pts.length - 1]]) for (const b of eight) {
    if (a === b) continue; const q = proj(b.pts, e[0], e[1]);
    if (q.d <= TOUCH && !joins.some((j) => hyp(j.x - q.p[0], j.z - q.p[1]) < 50)) joins.push({ x: q.p[0], z: q.p[1], ids: `${a.id} x ${b.id}` });
  }
  const touches: Touch[] = [];
  for (const l of lines) {
    if (l.cls === '8' || l.built || l.dropped) continue;
    for (const [k, e] of [['S', l.pts[0]], ['E', l.pts[l.pts.length - 1]]] as [string, number[]][]) {
      let bd = Infinity, bid = '', bp = [0, 0];
      for (const b of eight) { const q = proj(b.pts, e[0], e[1]); if (q.d < bd) { bd = q.d; bid = b.id; bp = q.p; } }
      if (bd > TOUCH) continue;
      touches.push({ line: l.id, cls: l.cls, end: k as 'S' | 'E', x: bp[0], z: bp[1], on: bid, d8: bd, dJ1: hyp(bp[0] - J1.x, bp[1] - J1.z) - J1.r, tap: '-', tapD: 1e18, joinD: 1e18, other: '-', otherD: 1e18, flags: [], slid: SLID.includes(`${l.id}|${k}`) });
    }
  }
  // nearest tap / join / other touch (touches of the same node, within TAP_SNAP of each other, count as ONE node)
  for (const t of touches) {
    for (const p of taps) { const d = hyp(t.x - p.x, t.z - p.z); if (d < t.tapD) { t.tapD = d; t.tap = p.id; } }
    for (const j of joins) t.joinD = Math.min(t.joinD, hyp(t.x - j.x, t.z - j.z));
    for (const o of touches) { if (o === t) continue; const d = hyp(t.x - o.x, t.z - o.z); if (d > TAP_SNAP && d < t.otherD) { t.otherD = d; t.other = `${o.line}${o.end}`; } }
    const atTap = t.tapD <= TAP_SNAP;
    if (t.cls === '2' || t.cls === 'C' || t.cls === 'L') t.flags.push('R5a: class ' + t.cls + ' touches an 8-lane road');
    if (t.joinD < JOIN_MIN) t.flags.push(`R5b: ${f0(t.joinD)} m from a ring x arm join`);
    if (t.dJ1 < J1_MIN) t.flags.push(`R5c: ${f0(t.dJ1)} m from the J1 plaza edge`);
    const gap = Math.min(atTap || RB ? 1e18 : t.tapD, t.joinD, t.otherD);
    if ((t.cls === '6' || t.cls === '4') && gap < SPACING) t.flags.push(`R5d: ${f0(gap)} m to the nearest tap / join / other touch`);
  }
  pr(''); pr(`${title}`);
  pr(`   ${lines.filter((l) => l.cls === '8' && !l.dropped).length} 8-lane lines, ${joins.length} ring x arm joins, ${taps.length} known taps, J1 (${f0(J1.x)}, ${f0(J1.z)}) plaza radius ${J1.r} m`);
  const byCls: Record<string, number> = {}; for (const t of touches) byCls[t.cls] = (byCls[t.cls] ?? 0) + 1;
  pr(`   ${touches.length} line ends touch an 8-lane road (within ${TOUCH} m): ${JSON.stringify(byCls)}`);
  return { touches, joins };
}

pr('STEP B2 (21.41): R5 tap spacing recheck on the fitted + joined lines (headless, read only; nothing in src or data changed; tsc / npm run build / game NOT RUN: no node_modules)');
const drawn = run(load(`${OUT}/centre_fixed.json`), 'BEFORE: docs/centre_fixed.json (the drawn lines after 21.3 / 21.6a, the input of the fit)');
const fitted = run(load(`${OUT}/fit_chain/centre_fixed.json`), 'AFTER: docs/fit_chain/centre_fixed.json (fitted alignments + B3 joint refit)');

pr(''); pr('TOUCH LIST (after): line end, 8-lane road, J1 plaza distance, nearest tap, nearest ring x arm join, nearest other touch, flags');
for (const t of fitted.touches.sort((a, b) => a.on.localeCompare(b.on) || a.x - b.x)) {
  pr(`   ${(t.line + ' ' + t.end).padEnd(9)} ${t.cls.padEnd(2)} on ${t.on.padEnd(8)} (${f0(t.x)}, ${f0(t.z)})  J1 ${f0(t.dJ1).padStart(5)} m  tap ${t.tap} ${t.tapD > 1e17 ? '-' : f0(t.tapD)} m  join ${t.joinD > 1e17 ? '-' : f0(t.joinD)} m  other ${t.other} ${t.otherD > 1e17 ? '-' : f0(t.otherD)} m${t.slid ? '  [SLID END]' : ''}${t.flags.length ? '  <- ' + t.flags.join('; ') : ''}`);
}
// ---------- before / after: did the fit move any touch? ----------
pr(''); pr('BEFORE / AFTER: position of every touch on the 8-lane road (the ends on an 8-lane road were pinned in the fit, only slid ends may move)');
let maxShift = 0, shifted = 0, missing = 0;
for (const t of fitted.touches) { const o = drawn.touches.find((x) => x.line === t.line && x.end === t.end); if (!o) { missing++; continue; } const d = hyp(o.x - t.x, o.z - t.z); maxShift = Math.max(maxShift, d); if (d > 1) { shifted++; pr(`   ${t.line} ${t.end}: moved ${d.toFixed(1)} m along ${t.on}`); } }
pr(`   ${shifted} touches moved more than 1 m, largest ${maxShift.toFixed(1)} m, ${missing} touches without a before partner`);

// ---------- nodes (touches within TAP_SNAP are ONE node) and the PROPOSAL (not applied): every node goes to its nearest known tap ----------
const nodesT: { x: number; z: number; legs: string[]; on: string; cls: string[] }[] = [];
for (const t of fitted.touches) { const n = nodesT.find((q) => hyp(q.x - t.x, q.z - t.z) <= TAP_SNAP); if (n) { n.legs.push(`${t.line}${t.end}`); n.cls.push(t.cls); } else nodesT.push({ x: t.x, z: t.z, legs: [`${t.line}${t.end}`], on: t.on, cls: [t.cls] }); }
pr(''); pr(`NODES ON THE 8-LANE ROADS: ${nodesT.length} distinct nodes (touches within ${TAP_SNAP} m = one node) for ${taps.length} known taps`);
pr('PROPOSAL (NOT applied, R10): move every node along its 8-lane road to the nearest known tap; slide = straight distance to that tap. A tap may take several lines (4-leg / 3-leg junction on the M8 / arm), the lines need a refit of the last 100 - 300 m (like B3).');
const rowsP = nodesT.map((n) => { let b = { id: '-', d: 1e18 }; for (const p of taps) { const d = hyp(n.x - p.x, n.z - p.z); if (d < b.d) b = { id: p.id, d }; } return { n, tap: b.id, slide: b.d }; }).sort((a, b) => a.tap.localeCompare(b.tap) || a.slide - b.slide);
for (const r of rowsP) pr(`   ${r.tap.padEnd(7)} slide ${f0(r.slide).padStart(5)} m  node (${f0(r.n.x)}, ${f0(r.n.z)}) on ${r.n.on.padEnd(6)} legs ${r.n.legs.join(' ')}${r.slide <= TAP_SNAP ? '  (already at the tap)' : r.slide <= 450 ? '' : '  <- over 450 m: needs a NEW tap or another road'}`);
const atTap = rowsP.filter((r) => r.slide <= TAP_SNAP).length, small = rowsP.filter((r) => r.slide > TAP_SNAP && r.slide <= 450).length, big = rowsP.filter((r) => r.slide > 450).length;
pr(`   summary: ${atTap} nodes already at a tap, ${small} within 450 m of a tap (small slide), ${big} farther (new tap or another road); taps with no node: ${taps.filter((p: any) => !rowsP.some((r) => r.tap === p.id)).map((p: any) => p.id).join(' ') || 'none'}`);
const perTap = new Map<string, number>(); for (const r of rowsP) perTap.set(r.tap, (perTap.get(r.tap) ?? 0) + 1);
pr(`   nodes per tap: ${[...perTap].map(([k, v]) => `${k} ${v}`).join(', ')}`);

pr(''); pr('SLID ENDS (21.25 / 21.38 left their tap spacing for this step): R6-15 start / end, R6-11 end, R6-12 end');
const SLID_NOTE = true; void SLID_NOTE;
for (const t of fitted.touches.filter((x) => x.slid)) pr(`   ${t.line} ${t.end} on ${t.on}: J1 ${f0(t.dJ1)} m, tap ${t.tap} ${f0(t.tapD)} m, join ${t.joinD > 1e17 ? '-' : f0(t.joinD)} m, other touch ${t.other} ${t.otherD > 1e17 ? '-' : f0(t.otherD)} m${t.flags.length ? '  <- ' + t.flags.join('; ') : '  ok'}`);
const notTouch = SLID.filter((k) => !fitted.touches.some((x) => `${x.line}|${x.end}` === k)); if (notTouch.length) pr(`   not on an 8-lane road (they end on another line, R5 does not apply to them): ${notTouch.join(', ')}`);

pr(''); pr('CHECKS');
const cnt = (ts: Touch[], p: string): number => ts.filter((t) => t.flags.some((f) => f.startsWith(p))).length;
chk(cnt(fitted.touches, 'R5a') === 0, `R5a no R2 / C / L end on an 8-lane road: ${cnt(fitted.touches, 'R5a')} found (before ${cnt(drawn.touches, 'R5a')})`);
chk(cnt(fitted.touches, 'R5b') === 0, `R5b nothing leaves a ring x arm join: ${cnt(fitted.touches, 'R5b')} found (before ${cnt(drawn.touches, 'R5b')})`);
chk(cnt(fitted.touches, 'R5c') === 0, `R5c nothing within ${J1_MIN} m of the J1 plaza edge: ${cnt(fitted.touches, 'R5c')} found (before ${cnt(drawn.touches, 'R5c')})`);
chk(cnt(fitted.touches, 'R5d') === 0, `R5d every R6 / R4 touch is 1600 m from tap / join / other touch: ${cnt(fitted.touches, 'R5d')} conflicts (before ${cnt(drawn.touches, 'R5d')})`);
chk(fitted.touches.every((t) => t.d8 <= TOUCH), 'every touch lies on its 8-lane road (distance under 12 m)');
pr(`   RESULT ${pass} PASS ${fail} FAIL (a FAIL here is a LIST for the user, R10: his lines come first; the script moves nothing)`);

if (!RB) writeFileSync(`${OUT}/centre_r5.json`, JSON.stringify({ proposal: rowsP.map((r) => ({ tap: r.tap, slide: Math.round(r.slide), x: Math.round(r.n.x), z: Math.round(r.n.z), on: r.n.on, legs: r.n.legs })), note: 'B2 21.41: R5 recheck, touches of fitted lines on 8-lane roads', limits: { TOUCH, TAP_SNAP, JOIN_MIN, J1_MIN, SPACING }, joins: fitted.joins, taps, before: drawn.touches, after: fitted.touches }, null, 0));
writeFileSync(`${OUT}/${RB ? 'STEP_B2C_OUTPUT' : 'STEP_B2_OUTPUT'}.txt`, L.join('\n') + '\n');
process.exit(0);
