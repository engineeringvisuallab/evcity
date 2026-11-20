// STEP CRR-5b check (headless, REAL game data, tsx): flag OFF vs ON. Run: npx tsx scripts/crr-check.ts docs   (writes docs/STEP_CRR5B_OUTPUT.txt, docs/crr5b_check.json)
// 1 WATER first (sc.water > sc.h on the finished ground at the road centreline and +-11.2 m)  2 rail unchanged (piers, design heights, segments)  3 existing roads unchanged  4 per piece: grade, cut / fill, rail clearance, node heights
// 5 finished ground (roads.apply + railForm.apply) vs road surface: where the RAIL earthworks win over the road  6 piers vs the median (pier row inside 6.4 m, 1.6 m to the lane edge)  7 other rail piers near the new asphalt
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as RD } from '../src/rail/RailPlan';

const dir = process.argv[2] ?? 'docs';
const log: string[] = []; const P = (m: string): void => { console.log(m); log.push(m); };
const hash = (parts: (ArrayLike<number> | string | number)[]): string => { const h = createHash('sha1'); for (const p of parts) { if (typeof p === 'string' || typeof p === 'number') h.update(String(p)); else h.update(Buffer.from(new Float64Array(Array.from(p)).buffer)); } return h.digest('hex').slice(0, 12); };
Config.roads.junctionJ1Arms.enabled = true;
const sig = (gen: any): { rail: string; piers: number; roads: string[] } => {
  const rail = gen.rail;
  const pierSig = hash(rail.piers.flatMap((q: any) => [q.edgeId, q.s, q.x, q.z, q.baseY, q.deckY]));
  const edgeSig = hash(rail.edges.flatMap((e: any) => [e.id, e.length, hash([e.design]), e.segments.map((s: any) => s.kind + s.s0.toFixed(2) + s.s1.toFixed(2)).join(',')]));
  return { rail: hash([pierSig, edgeSig]), piers: rail.piers.length, roads: gen.roads.roads.map((r: any) => r.name + ':' + hash([r.xs, r.zs, r.ys])) };
};
Config.roads.corridorRoads.enabled = false;
const off: any = new TerrainGenerator(Config.world.seed);
const sOff = sig(off);
Config.roads.corridorRoads.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed);
const sOn = sig(gen);
const net = gen.roads, sc = gen.makeSample();
P(`CRR-5b check: flag OFF roads ${sOff.roads.length}, flag ON roads ${sOn.roads.length} (added ${sOn.roads.length - sOff.roads.length})`);

// 1 WATER first
let wetN = 0;
const rep = net.corridorReport as any[];
for (const r of rep) {
  const rd = net.roads[r.roadId];
  for (let i = 0; i < rd.xs.length; i++) for (const o of [-14.2, -11.2, -5, 0, 5, 11.2, 14.2]) { gen.sample(rd.xs[i] + rd.nx[i] * o, rd.zs[i] + rd.nz[i] * o, sc); if (sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h) { wetN++; if (wetN < 6) P(`  WATER ${rd.name} point ${i} offset ${o}`); } }
}
P(`1 WATER (sc.water > sc.h, finished ground, 7 offsets per point): ${wetN === 0 ? 'PASS, 0 wet samples' : 'FAIL, ' + wetN + ' wet samples'}`);

// 2 rail unchanged
P(`2 RAIL unchanged: piers OFF ${sOff.piers} ON ${sOn.piers}, rail signature (piers + design heights + segments) OFF ${sOff.rail} ON ${sOn.rail}: ${sOff.rail === sOn.rail && sOff.piers === sOn.piers ? 'SAME' : 'DIFFERENT (FAIL)'}`);
// 3 existing roads unchanged
let diff = 0; for (let i = 0; i < sOff.roads.length; i++) if (sOff.roads[i] !== sOn.roads[i]) { diff++; P(`  road changed: ${sOff.roads[i]} -> ${sOn.roads[i]}`); }
P(`3 EXISTING roads unchanged (name + centreline + heights hash of the first ${sOff.roads.length}): ${diff === 0 ? 'SAME' : diff + ' DIFFERENT (FAIL)'}`);

// 4 per piece
P('4 PER PIECE (road surface heights from the natural ground, smoothed +-' + Config.roads.corridorRoads.smoothHalf + ' m, grade limit ' + (Config.roads.corridorRoads.maxGrade * 100) + ' %):');
let issues = 0;
for (const r of rep) { issues += r.issues.length; P(`  ${r.name.padEnd(13)} len ${r.length.toFixed(0).padStart(4)} m  max grade ${(r.maxGrade * 100).toFixed(2)} %  max cut ${r.maxCut.toFixed(2)} m  max fill ${r.maxFill.toFixed(2)} m  rail clearance margin ${r.minClearMargin === null ? '-' : r.minClearMargin.toFixed(2) + ' m'}  nodes: ${r.anchors.map((a: any) => `${a.road} dy ${a.dy.toFixed(2)} off ${a.dist.toFixed(1)} m`).join('; ') || '-'}${r.issues.length ? '  ISSUES: ' + r.issues.join(', ') : ''}`); }
P(`  issues total ${issues}`);

// 5 finished ground vs road surface
P('5 FINISHED GROUND (roads.apply then railForm.apply) vs the road surface (centreline and +-5 m): count of 8 m points where |ground - road y| > 0.30 m:');
const j5: any = {};
for (const r of rep) {
  const rd = net.roads[r.roadId]; let bad = 0, tot = 0, maxD = 0, worst = '';
  for (let i = 0; i < rd.xs.length; i++) for (const o of [-5, 0, 5]) { gen.sample(rd.xs[i] + rd.nx[i] * o, rd.zs[i] + rd.nz[i] * o, sc); const d = sc.h - rd.ys[i]; tot++; if (Math.abs(d) > 0.3) bad++; if (Math.abs(d) > Math.abs(maxD)) { maxD = d; worst = `(${rd.xs[i].toFixed(0)}, ${rd.zs[i].toFixed(0)}) o ${o}`; } }
  j5[r.name] = { bad, tot, maxD };
  P(`  ${r.name.padEnd(13)} ${String(bad).padStart(3)} of ${String(tot).padStart(3)} samples differ > 0.30 m, worst ${maxD.toFixed(2)} m at ${worst || '-'}`);
}
const railPts: number[][] = []; for (const e of gen.rail.edges) for (let q = 0; q <= e.length; q += 5) { const t = gen.rail.pointAt(e, q); railPts.push([t.x, t.z]); }
const railDist = (x: number, z: number): number => { let m = Infinity; for (const q of railPts) { const d = Math.hypot(q[0] - x, q[1] - z); if (d < m) m = d; } return m; };
P('5b samples with |ground - road y| > 0.30 m, with the distance to the nearest rail centreline (any rail edge):');
for (const r of rep) { const rd = net.roads[r.roadId]; for (let i = 0; i < rd.xs.length; i++) for (const o of [-5, 0, 5]) { const x = rd.xs[i] + rd.nx[i] * o, z = rd.zs[i] + rd.nz[i] * o; gen.sample(x, z, sc); const d = sc.h - rd.ys[i]; if (Math.abs(d) > 0.3) P(`  ${r.name} point ${i} (${x.toFixed(0)}, ${z.toFixed(0)}) offset ${o}: ground ${d >= 0 ? '+' : ''}${d.toFixed(2)} m vs road, rail centreline ${railDist(x, z).toFixed(0)} m away`); } }
// 6 + 7 piers
P('6 PIERS of the own rail line vs the road (pier half 1.6 m, median half 3.2 m: pier centre must be inside the median, gap pier edge to lane edge >= 1.6 m):');
const roadsC = rep.map((r) => net.roads[r.roadId]);
const nearest = (x: number, z: number, rd: any): { d: number; side: number; end: boolean } => { let b = Infinity, sd = 0, en = false; const last = rd.xs.length - 2; for (let k = 0; k + 1 < rd.xs.length; k++) { const vx = rd.xs[k + 1] - rd.xs[k], vz = rd.zs[k + 1] - rd.zs[k], l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - rd.xs[k]) * vx + (z - rd.zs[k]) * vz) / l2)), px = rd.xs[k] + t * vx, pz = rd.zs[k] + t * vz, d = Math.hypot(x - px, z - pz); if (d < b) { b = d; sd = (x - px) * -vz + (z - pz) * vx; en = (k === 0 && t === 0) || (k === last && t === 1); } } return { d: b, side: sd, end: en }; };
const own: Record<string, any[]> = {}; const other: { pier: any; road: string; d: number }[] = [];
for (const pr of gen.rail.piers) for (const rd of roadsC) { const nn = nearest(pr.x, pr.z, rd); if (nn.d < 25 && !nn.end) { if (rd.name.includes(pr.edgeId === 'south-1' ? 'S1' : pr.edgeId === 'north-1' ? 'N1' : pr.edgeId === 'east-1' ? 'E1' : pr.edgeId === 'west-nw' ? 'WNW' : pr.edgeId === 'west-sw' ? 'WSW' : '@@')) (own[rd.name] ??= []).push({ s: pr.s, d: nn.d }); else other.push({ pier: pr, road: rd.name, d: nn.d }); } }
for (const r of rep) { const a = own[r.name] ?? []; const md = a.length ? Math.max(...a.map((q: any) => q.d)) : 0; P(`  ${r.name.padEnd(13)} piers beside the piece (not beyond its ends): ${String(a.length).padStart(3)}  max offset of a pier centre from the road centreline ${md.toFixed(2)} m  -> gap pier edge to lane edge ${(3.2 - md - 1.6).toFixed(2)} m ${r.name.includes('loop') ? '(loop: no pier row, normal median)' : ''}`); }
P('6b LOOP vs the own rail piers (rail pier half 1.6 m, loop half width 11.5 m, pierRoadGap 1.6 m => centre offset must be >= ' + (11.5 + 1.6 + 1.6).toFixed(1) + ' m; < ' + (11.5 + 1.6).toFixed(1) + ' m = the pier stands IN the asphalt / shoulder):');
for (const r of rep) { if (!r.name.endsWith('loop')) continue; const a = (own[r.name] ?? []).sort((q: any, w: any) => q.s - w.s); const inAsph = a.filter((q: any) => q.d < 13.1).length, tight = a.filter((q: any) => q.d >= 13.1 && q.d < 14.7).length; P(`  ${r.name.padEnd(13)} piers beside the loop: ${a.map((q: any) => `s${q.s.toFixed(0)}: ${q.d.toFixed(1)} m`).join(', ') || 'none'}  => IN asphalt ${inAsph}, gap too small ${tight}`); }
// 6c (CRR-2d): EVERY pier of the own rail line vs the connector centreline, no end skipped (the piers beside the start in the pier gap are the critical ones); needed centre offset >= 11.5 + 1.6 + 1.6 = 14.7 m (0.1 m tolerance for the 8 m resample)
{ let fail6c = 0; const tag = (id: string): string => (id === 'south-1' ? 'S1' : id === 'north-1' ? 'N1' : id === 'east-1' ? 'E1' : id === 'west-nw' ? 'WNW' : id === 'west-sw' ? 'WSW' : '@@');
  for (const r of rep) { if (!r.name.endsWith('loop')) continue; const rd = net.roads[r.roadId]; let m = Infinity, ms = 0;
    for (const pr of gen.rail.piers) { if (!r.name.includes(tag(pr.edgeId))) continue; let b = Infinity; for (let k = 0; k + 1 < rd.xs.length; k++) { const vx = rd.xs[k + 1] - rd.xs[k], vz = rd.zs[k + 1] - rd.zs[k], l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((pr.x - rd.xs[k]) * vx + (pr.z - rd.zs[k]) * vz) / l2)); b = Math.min(b, Math.hypot(pr.x - rd.xs[k] - t * vx, pr.z - rd.zs[k] - t * vz)); } if (b < m) { m = b; ms = pr.s; } }
    const ok = m >= 14.6; if (!ok) fail6c++; P(`6c ${r.name.padEnd(13)} nearest own pier s${ms.toFixed(0)} ${m.toFixed(2)} m from the connector centreline (need >= 14.7): ${ok ? 'PASS' : 'FAIL'}`); }
  P(`6c own piers vs connectors: ${fail6c === 0 ? 'PASS' : 'FAIL (' + fail6c + ')'}`); }
// 8 (CRR-6) HUB RING RR-HUB: 8a every rail pier >= ring edge 9.5 + pier half 1.6 + pierRoadGap 1.6 = 12.7 m from the ring centreline; 8b rail deck underside - ring surface >= railOverRoad where a rail point lies within 9.5 + deck half 5.8 m;
//   8c the 5 start lines of the corridor roads (2 corners + centre) keep >= 0.3 m from the ring's pavement + ditch (T joint, no overlap); 8d the ring keeps >= 0.3 m from the pavement + shoulder of every other existing road. NOT covered: the station buildings / platforms (designed later).
{ const ringRep = rep.find((r: any) => r.name === 'RR-HUB');
  if (!ringRep) P('8 HUB RING: not built (NOT RUN)');
  else {
    const ring = net.roads[ringRep.roadId], RE = 9.5, fails: string[] = [];
    const segD = (rd: any, x: number, z: number): { d: number; y: number } => { let b = Infinity, y = 0; const nSeg = rd.closed ? rd.xs.length : rd.xs.length - 1; for (let k = 0; k < nSeg; k++) { const k2 = (k + 1) % rd.xs.length, vx = rd.xs[k2] - rd.xs[k], vz = rd.zs[k2] - rd.zs[k], l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - rd.xs[k]) * vx + (z - rd.zs[k]) * vz) / l2)), d = Math.hypot(x - rd.xs[k] - t * vx, z - rd.zs[k] - t * vz); if (d < b) { b = d; y = rd.ys[k] + (rd.ys[k2] - rd.ys[k]) * t; } } return { d: b, y }; };
    let cx = 0, cz = 0; for (let i = 0; i < ring.xs.length; i++) { cx += ring.xs[i]; cz += ring.zs[i]; } cx /= ring.xs.length; cz /= ring.xs.length;
    let rr = 0; for (let i = 0; i < ring.xs.length; i++) rr += Math.hypot(ring.xs[i] - cx, ring.zs[i] - cz); rr /= ring.xs.length;
    P(`8 HUB RING RR-HUB: centre (${cx.toFixed(1)}, ${cz.toFixed(1)}), mean radius ${rr.toFixed(1)} m, ${ring.xs.length} points, closed ${ring.closed}, length ${ringRep.length.toFixed(0)} m, 4 lanes undivided (half width ${ring.halfWidth} m + ditch ${ring.shoulder} m)`);
    // 8a piers (all lines, every pier of the rail network)
    let minP = Infinity, minPs = '', nearP = 0; for (const pr of gen.rail.piers) { const d = segD(ring, pr.x, pr.z).d; if (d < minP) { minP = d; minPs = `${pr.edgeId} s${pr.s.toFixed(0)} (${pr.x.toFixed(0)}, ${pr.z.toFixed(0)})`; } if (d < RE + 1.6 + 1.6 - 0.1) nearP++; }
    P(`8a rail piers vs ring centreline (need >= ${(RE + 3.2).toFixed(1)} m): nearest ${minP.toFixed(2)} m, ${minPs}, piers too close ${nearP}: ${nearP === 0 ? 'PASS' : 'FAIL'}`); if (nearP) fails.push('8a');
    // 8b deck clearance over the ring
    const railY = (e: any, s: number): number => { const q = gen.rail.pointAt(e, s); const t = (s - e.cum[q.i]) / (e.cum[q.i + 1] - e.cum[q.i] || 1); return e.design[q.i] + (e.design[q.i + 1] - e.design[q.i]) * t; };
    let minM = Infinity, minMs = '', nOver = 0; for (const e of gen.rail.edges) for (let q = 0; q <= e.length; q += 1) { const t = gen.rail.pointAt(e, q), r0 = segD(ring, t.x, t.z); if (r0.d > RE + 5.8) continue; nOver++; const m = railY(e, q) - RD.ballast - RD.deckThick - r0.y; if (m < minM) { minM = m; minMs = `${e.id} s${q} (${t.x.toFixed(0)}, ${t.z.toFixed(0)})`; } }
    const need = Config.roads.roadRailBuffer.railOverRoad;
    P(`8b rail deck underside over the ring (rail points within ${(RE + 5.8).toFixed(1)} m of the ring centreline: ${nOver}; need >= ${need} m): ${nOver ? `smallest clearance ${minM.toFixed(2)} m at ${minMs}: ${minM >= need ? 'PASS' : 'FAIL'}` : 'no rail point there (no deck over the ring), PASS'}`); if (nOver && minM < need) fails.push('8b');
    // 8c start lines of the 5 corridor roads
    for (const r of rep) { if (!(CORRIDOR_ROAD_DATA.find((q) => q.name === r.name)?.nodes ?? []).some((nd) => nd.road === 'RR-HUB')) continue; const rd = net.roads[r.roadId], dx = rd.xs[1] - rd.xs[0], dz = rd.zs[1] - rd.zs[0], l = Math.hypot(dx, dz) || 1; let g = Infinity; for (const o of [-11.2, 0, 11.2]) g = Math.min(g, segD(ring, rd.xs[0] - (dz / l) * o, rd.zs[0] + (dx / l) * o).d - RE); const ok = g >= 0.29; if (!ok) fails.push('8c ' + r.name); P(`8c ${r.name.padEnd(13)} start line (2 corners + centre) clear of the ring pavement + ditch: ${g.toFixed(2)} m (need >= 0.30): ${ok ? 'PASS' : 'FAIL'}   height at the start ${rd.ys[0].toFixed(2)} m, ring ${segD(ring, rd.xs[0], rd.zs[0]).y.toFixed(2)} m`); }
    // 8d other existing roads
    let minG = Infinity, minGn = '', nTight = 0; for (const rd of net.roads.slice(0, sOff.roads.length)) { if (rd.earth) continue; let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity; for (let i = 0; i < rd.xs.length; i++) { bx0 = Math.min(bx0, rd.xs[i]); bx1 = Math.max(bx1, rd.xs[i]); bz0 = Math.min(bz0, rd.zs[i]); bz1 = Math.max(bz1, rd.zs[i]); } if (cx < bx0 - 400 || cx > bx1 + 400 || cz < bz0 - 400 || cz > bz1 + 400) continue; let g = Infinity; for (let i = 0; i < ring.xs.length; i++) g = Math.min(g, segD(rd, ring.xs[i], ring.zs[i]).d); g -= RE + rd.halfWidth + rd.shoulder; if (g < minG) { minG = g; minGn = rd.name; } if (g < 0.3) nTight++; }
    P(`8d ring vs every other existing road (centreline distance - ring edge ${RE} m - road half width - shoulder, need >= 0.30 m): smallest gap ${minG.toFixed(1)} m (${minGn || '-'}), roads closer than 0.30 m: ${nTight}: ${nTight === 0 ? 'PASS' : 'FAIL'}`); if (nTight) fails.push('8d');
    P(`8 HUB RING: ${fails.length === 0 ? 'ALL PASS (headless)' : 'FAIL ' + fails.join(', ')}`);
  } }
P(`7 PIERS of OTHER rail lines / edges within 25 m of a new road centreline: ${other.length}` + (other.length ? ' ' + other.slice(0, 8).map((o) => `${o.pier.edgeId} s${o.pier.s.toFixed(0)} ${o.road} ${o.d.toFixed(1)} m`).join('; ') : ''));
// geometry for the picture (tools/crr5b-plot.py)
import { CORRIDOR_ROAD_DATA } from '../src/roads/crr/CorridorRoadData';
const geo: any = { pieces: rep.map((r) => { const rd = net.roads[r.roadId]; const d = CORRIDOR_ROAD_DATA.find((q) => q.name === r.name)!; return { name: r.name, kind: d.kind, x: Array.from(rd.xs, (v: number) => +v.toFixed(1)), z: Array.from(rd.zs, (v: number) => +v.toFixed(1)), y: Array.from(rd.ys, (v: number) => +v.toFixed(2)), ground: Array.from(rd.hNat, (v: number) => +v.toFixed(2)), cap: d.cap ? Array.from({ length: rd.xs.length }, (_, i) => { const t = (i / (rd.xs.length - 1)) * (d.cap!.length - 1), k = Math.min(d.cap!.length - 2, Math.floor(t)); return +(d.cap![k] + (d.cap![k + 1] - d.cap![k]) * (t - k)).toFixed(2); }) : null }; }),
  existing: net.roads.slice(0, sOff.roads.length).filter((r: any) => !r.earth).map((r: any) => ({ name: r.name, lanes: r.lanes, x: Array.from(r.xs, (v: number) => Math.round(v)), z: Array.from(r.zs, (v: number) => Math.round(v)) })),
  rail: gen.rail.edges.map((e: any) => ({ id: e.id, pts: Array.from({ length: Math.floor(e.length / 20) + 1 }, (_, i) => { const t = gen.rail.pointAt(e, i * 20); return [Math.round(t.x), Math.round(t.z)]; }) })),
  pierInAsphalt: gen.rail.piers.filter((pr: any) => roadsC.some((rd: any) => rd.name.endsWith('loop') && (() => { const nn = nearest(pr.x, pr.z, rd); return nn.d < 13.1 && !nn.end; })())).map((pr: any) => [pr.x, pr.z]) };
fs.writeFileSync(dir + '/crr5b_geo.json', JSON.stringify(geo));
fs.writeFileSync(dir + '/STEP_CRR5B_OUTPUT.txt', log.join('\n') + '\n');
fs.writeFileSync(dir + '/crr5b_check.json', JSON.stringify({ report: rep, ground: j5, wet: wetN, railSame: sOff.rail === sOn.rail, roadsChanged: diff }, null, 1));
