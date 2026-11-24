// STEP HK-9d-3 check: road arrows (direction + lane-end) on the loop ramps, C-D roads and slips (HkArrows.ts). PURE: no TerrainGenerator, no three.js, no Rapier (loop data, C-D data and a synthetic frame only).
// Run: npx tsx scripts/hk-arrows-check.ts
import { buildHkArrows, HA, hkArrowLines, type HkArrowLine } from '../src/roads/ring/HkArrows';
import { HK_CD_ROADS } from '../src/roads/ring/HkCdRoadData';
import { RTE_MESH } from '../src/roads/junction/RteMesh';
import { HP } from '../src/roads/ring/HkDeckPaving';
import type { HkFrame } from '../src/roads/ring/HkRamps';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(76)} ${detail}`); };
const f2 = (v: number): string => v.toFixed(2);

// synthetic frame: world x east, z south, so local north = -z; node at the origin
const f: HkFrame = { ox: 0, oz: 0, ex: 1, ez: 0, nx: 0, nz: -1, squareErrDeg: 0 };
const loc = (x: number, z: number): [number, number] => [x * f.ex + z * f.ez, x * f.nx + z * f.nz];
const set = buildHkArrows(f);
const L = (id: string): HkArrowLine => set.lines.find((l) => l.id === id)!;
const mv: number[][] = []; for (let i = 0; i < set.mesh.positions.length; i += 3) mv.push([set.mesh.positions[i], set.mesh.positions[i + 1], set.mesh.positions[i + 2]]);
console.log(`arrows ${set.arrows.length} (${set.arrows.filter((a) => a.kind === 'straight').length} straight, ${set.arrows.filter((a) => a.kind === 'end').length} lane-end), ${mv.length} vertices, ${set.mesh.indices.length / 3} triangles`);

// A1 data directions (independent of the builder): slips end / start on the ring (|local y| about 17.3), C-D roads run along the arm / link
const cd = (id: string): { first: number[]; last: number[] } => { const r = HK_CD_ROADS.find((q) => q.id === id)!; return { first: r.pts[0], last: r.pts[r.pts.length - 1] }; };
const ringEnd = (p: number[]): boolean => Math.abs(Math.abs(p[1]) - 17.3) < 1.5;
const okSlips = ringEnd(cd('SLIP-NE').last) && ringEnd(cd('SLIP-SW').last) && ringEnd(cd('SLIP-SE').first) && ringEnd(cd('SLIP-NW').first);
check(okSlips, 'A1 slip data are in travel direction (NE, SW end on the ring; SE, NW start on it)', `NE end y ${f2(cd('SLIP-NE').last[1])}, SW end y ${f2(cd('SLIP-SW').last[1])}, SE start y ${f2(cd('SLIP-SE').first[1])}, NW start y ${f2(cd('SLIP-NW').first[1])}`);
const okCd = cd('CD-E-N').first[1] > cd('CD-E-N').last[1] && cd('CD-W-N').first[1] < cd('CD-W-N').last[1] && cd('CD-E-S').first[1] > cd('CD-E-S').last[1] && cd('CD-W-S').first[1] < cd('CD-W-S').last[1];
check(okCd, 'A1 C-D data are in travel direction (E: southbound, W: northbound, as the dir text says)', `E-N y ${f2(cd('CD-E-N').first[1])} -> ${f2(cd('CD-E-N').last[1])}, W-N ${f2(cd('CD-W-N').first[1])} -> ${f2(cd('CD-W-N').last[1])}`);

// A2 12 lines, loop direction read from the data and equal to the hand reading (right turns of left-hand traffic, exit AFTER the crossing): SE (arm S -> ring W) and NW (link N -> ring E) leave a C-D road for the ring;
// NE (ring E -> link S) and SW (ring W -> arm N) come from the ring and join a C-D road (CD-E-N / CD-W-S)
check(set.lines.length === 12 && ['CD-E-N', 'CD-W-N', 'CD-E-S', 'CD-W-S', 'SLIP-NE', 'SLIP-SE', 'SLIP-NW', 'SLIP-SW', 'HK-SE', 'HK-NE', 'HK-NW', 'HK-SW'].every((id) => set.lines.some((l) => l.id === id)), 'A2 12 arrow lines: 4 C-D, 4 slips, 4 loops', set.lines.map((l) => l.id).join(' '));
const want: Record<string, boolean> = { 'HK-SE': true, 'HK-NW': true, 'HK-NE': false, 'HK-SW': false };
const loops = set.lines.filter((l) => l.kind === 'loop');
check(loops.every((l) => l.toRing === want[l.id]), 'A2 loop direction from the data = hand reading (SE, NW to the ring; NE, SW from the ring)', loops.map((l) => `${l.id} ${l.toRing ? 'C-D->ring' : 'ring->C-D'} (cos ${f2(l.flowDot!)})`).join(', '));
check(loops.every((l) => Math.abs(l.flowDot!) >= 0.5), 'A2 loop direction is not marginal (|cos| >= 0.5)', loops.map((l) => f2(Math.abs(l.flowDot!))).join(', '));

// A3 counts: every line has straight arrows, merge lines have 2 lane-end arrows, the two non-merge C-D halves none
const per = (id: string, k: string): number => set.arrows.filter((a) => a.line === id && a.kind === k).length;
check(set.lines.every((l) => per(l.id, 'straight') >= 1), 'A3 every line has at least one direction arrow', set.lines.map((l) => `${l.id}:${per(l.id, 'straight')}`).join(' '));
check(set.lines.filter((l) => l.merge).every((l) => per(l.id, 'end') === 2) && set.lines.filter((l) => !l.merge).every((l) => per(l.id, 'end') === 0), 'A3 merge lines (8 + 4 loops - 2 C-D halves) have 2 lane-end arrows, CD-E-N / CD-W-S none', set.lines.map((l) => `${l.id}:${per(l.id, 'end')}`).join(' '));
check(mv.length > 0 && mv.every((v) => Number.isFinite(v[0] + v[1] + v[2])), 'A3 mesh built, finite numbers', `${mv.length} vertices`);

// A4 style = the RT-E arrows (RteMesh RTE_MESH): the numbers are the same
const R = RTE_MESH;
check(HA.every === R.arrowEvery && HA.first === R.arrowFirst && HA.endGap === R.arrowEndGap && HA.shaft === R.arrowShaft && HA.head === R.arrowHead && HA.shaftW === R.arrowShaftW && HA.headW === R.arrowHeadW, 'A4 spacing and size equal the RT-E ramp arrows (every 100, first 30, end gap 40, 3.0 + 1.5 m, 0.3 / 1.4 m)', `HA ${HA.every}/${HA.first}/${HA.endGap}/${HA.shaft}/${HA.head}/${HA.shaftW}/${HA.headW}`);
const col0 = set.mesh.colors.slice(0, 3);
check(set.mesh.colors.every((c, i) => c === col0[i % 3]) && col0[0] > 0.85, 'A4 all arrow paint is one white (like the marks)', `rgb ${col0.map(f2).join(' ')}`);

// helpers on a line: nearest segment -> lateral (left +), along, level
const near = (l: HkArrowLine, x: number, z: number): { lat: number; ax: number; y: number; tx: number; tz: number; i: number } => {
  let b = Infinity, o = { lat: 0, ax: 0, y: 0, tx: 0, tz: 0, i: 0 };
  for (let i = 0; i < l.xs.length - 1; i++) {
    const bx = l.xs[i + 1] - l.xs[i], bz = l.zs[i + 1] - l.zs[i], l2 = bx * bx + bz * bz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - l.xs[i]) * bx + (z - l.zs[i]) * bz) / l2)) : 0;
    const px = l.xs[i] + bx * t, pz = l.zs[i] + bz * t, d = Math.hypot(x - px, z - pz);
    if (d < b) { b = d; const ln = Math.sqrt(l2) || 1; o = { lat: ((x - px) * bz - (z - pz) * bx) / ln, ax: l.cum[i] + (l.cum[i + 1] - l.cum[i]) * t, y: l.ys[i] + (l.ys[i + 1] - l.ys[i]) * t, tx: bx / ln, tz: bz / ln, i }; }
  }
  return o;
};
// every vertex belongs to the line whose arrow it is: nearest line (by distance) -> lateral, level
let maxLat = 0, maxDy = 0, worstOn = '';
for (const a of set.arrows) {
  const l = L(a.line);
  for (let k = a.v0; k < a.v1; k++) { // every vertex of an arrow against ITS OWN line
    const v = mv[k], n = near(l, v[0], v[2]);
    if (Math.abs(n.lat) > maxLat) { maxLat = Math.abs(n.lat); worstOn = l.id; }
    maxDy = Math.max(maxDy, Math.abs(v[1] - HP.lift - HA.mark - n.y));
  }
}
check(set.arrows.reduce((c, a) => c + a.v1 - a.v0, 0) === mv.length, 'A5 the arrow vertex ranges cover the whole mesh (no stray vertices)', `${mv.length} vertices`);
const limit = HA.leShift + HA.headW / 2 + 0.05;
check(maxLat <= limit, `A5 every arrow vertex lies within ${f2(limit)} m of its road centreline (inside the edge lines, which start at 3.6 m)`, `worst ${f2(maxLat)} m on ${worstOn}`);
check(maxDy <= 0.06, 'A5 every arrow vertex lies on the road surface level + lift (+- 0.06 m)', `worst ${f2(maxDy)} m`);

// A6 direction: nothing of a straight arrow lies ahead of its tip, and the tip vertex exists (the arrow points the way the traffic goes)
let okTip = 0, badTip = 0, badAhead = 0;
for (const a of set.arrows.filter((q) => q.kind === 'straight')) {
  const l = L(a.line), n = near(l, a.tip[0], a.tip[2]);
  if (mv.some((v) => Math.hypot(v[0] - a.tip[0], v[2] - a.tip[2]) < 0.02)) okTip++; else badTip++;
  for (const v of mv) { if (Math.hypot(v[0] - a.tip[0], v[2] - a.tip[2]) > 6) continue; if ((v[0] - a.tip[0]) * n.tx + (v[2] - a.tip[2]) * n.tz > 0.02 && near(l, v[0], v[2]).ax - n.ax < 3) badAhead++; }
}
check(badTip === 0 && badAhead === 0 && okTip > 20, 'A6 straight arrows point along the travel direction (tip vertex exists, nothing ahead of it)', `${okTip} arrows, ${badTip} without tip vertex, ${badAhead} vertices ahead of a tip`);

// A7 lane-end arrows bend toward the road that is joined. Independent target polylines from the raw data: ring axis (local y = 0), or the C-D piece it merges into
const target: Record<string, string> = { 'SLIP-NE': 'ring', 'SLIP-SW': 'ring', 'HK-SE': 'ring', 'HK-NW': 'ring', 'SLIP-SE': 'CD-E-S', 'HK-NE': 'CD-E-N', 'SLIP-NW': 'CD-W-N', 'HK-SW': 'CD-W-S', 'CD-W-N': 'CD-E-N', 'CD-E-S': 'CD-W-S' };
let okSide = 0, badSide = 0, txt = '';
for (const [id, tg] of Object.entries(target)) {
  const l = L(id), a = set.arrows.filter((q) => q.line === id && q.kind === 'end');
  // side seen from the line 30 m BEFORE its merge end (right at the end the two roads touch, so the direction to the joined road is noise)
  const k = Math.max(0, l.cum.findIndex((c) => c >= l.s1 - 30)), ex = l.xs[k], ez = l.zs[k];
  let qx = 0, qz = 0;
  if (tg === 'ring') { qx = ex; qz = 0; } // ring axis = local y 0 = world z 0
  else { const t = set.lines.find((q) => q.id === tg)!; let b = Infinity; for (let i = 0; i < t.xs.length; i++) { const d = Math.hypot(t.xs[i] - ex, t.zs[i] - ez); if (d < b) { b = d; qx = t.xs[i]; qz = t.zs[i]; } } }
  const n = near(l, ex, ez), toward = (qx - ex) * n.tz + (qz - ez) * -n.tx; // + = joined road is on the left of the heading
  const sgn = toward > 0 ? 1 : -1;
  for (const q of a) { if (q.side === sgn) okSide++; else badSide++; }
  txt += `${id} ${sgn > 0 ? 'left' : 'right'}; `;
}
check(badSide === 0 && okSide === 20, 'A7 lane-end arrows bend toward the joined road (10 merge lines x 2 arrows, side from raw data)', `${okSide} ok, ${badSide} wrong: ${txt}`);
// the tip vertex of every lane-end arrow really sits on the bend side (lateral sign of the geometry itself)
let geoBad = 0;
for (const a of set.arrows.filter((q) => q.kind === 'end')) { const n = near(L(a.line), a.tip[0], a.tip[2]); if (Math.sign(n.lat) !== a.side || Math.abs(Math.abs(n.lat) - HA.leShift) > 0.1) geoBad++; }
check(geoBad === 0, `A7 the tip of every lane-end arrow is ${HA.leShift} m off the lane centre on the bend side (geometry, not the record)`, `${geoBad} wrong`);

// A8 placement: inside the usable part, no overlap (tips >= 20 m apart on one line, straight arrows clear of the lane-end pair), straight arrows start at 30 m
let badPlace = 0, minGap = Infinity, firstOk = true;
for (const l of set.lines) {
  const a = set.arrows.filter((q) => q.line === l.id).sort((p, q) => p.s - q.s);
  a.forEach((q, i) => { const tail = q.s - (HA.shaft + HA.head); if (tail < l.s0 - 1e-6 || q.s > l.s1 + 1e-6) badPlace++; if (i > 0) minGap = Math.min(minGap, q.s - a[i - 1].s); });
  const st = a.filter((q) => q.kind === 'straight'); if (st.length && Math.abs(st[0].s - (l.s0 + HA.first)) > 1e-6) firstOk = false;
}
check(badPlace === 0 && minGap >= 20, 'A8 arrows stand inside the usable part, tips at least 20 m apart', `${badPlace} outside, least gap ${f2(minGap)} m`);
check(firstOk, 'A8 the first direction arrow of every line is 30 m from the start of its usable part (RT-E rule)', firstOk ? 'yes' : 'no');

// A9 triangles face up (normal y > 0): the paint lights like the road
let up = 0, tot = 0;
for (let t = 0; t < set.mesh.indices.length; t += 3) { const a = mv[set.mesh.indices[t]], b = mv[set.mesh.indices[t + 1]], c = mv[set.mesh.indices[t + 2]]; tot++; if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0) up++; }
check(up === tot && tot > 0, 'A9 every arrow triangle faces up', `${up} of ${tot}`);

// A10 loops: arrows only on the ramp-mesh part (more than 30 m from the ring axis), none on the paved tail beside the ring
const offs = loops.map((l) => { const ar = set.arrows.filter((q) => q.line === l.id); return ar.reduce((m, q) => Math.min(m, Math.abs(loc(q.tip[0], q.tip[2])[1])), Infinity); });
check(offs.every((o) => o > 30 - 1), 'A10 loop arrows keep > 29 m from the ring axis (the ramp mesh part)', offs.map(f2).join(', '));
console.log(`  INFO  lines: ${hkArrowLines(f).map((l) => `${l.id} ${f2(l.s1 - l.s0)} m`).join(', ')}`);
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
