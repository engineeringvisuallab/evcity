// J7-B GENERATOR (headless). R6 ROAD UNDER THE RAILWAY: the rail is a STATION VIADUCT at the crossing (not an embankment), so R6 (on its own 7 m walled fill) passes between two viaduct piers.
// Writes src/roads/junction/J300StructB.ts (GENERATED data, nothing imports it) and docs/J300_STRUCT_B.json.  Run: npx tsx scripts/j300-struct-b-gen.ts   Then: npx tsx scripts/j300-struct-b-check.ts docs
// Inputs: docs/J300_TERRAIN.json (R6 rows s,x,z,level,natural,hL,toeL..,hR..), real game rail (TerrainGenerator g.rail: edges, piers, stations; read only), RAIL_DESIGN (RailPlan.ts), SECTION_M6.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';
import { SECTION_M6 } from '../src/roads/standards/SectionTable';
const r2 = (x: number): number => Math.round(x * 100) / 100;
const T: any = JSON.parse(readFileSync('docs/J300_TERRAIN.json', 'utf8')); const A6 = T.arms.R6; const RW: number[][] = A6.rows;
const g: any = new TerrainGenerator(Config.world.seed); const RAIL = g.rail;
const TOP_HALF = A6.top as number;                               // 16.6 = M6 pavement edge 16.0 + barrier 0.6
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const rowAt = (s: number): { x: number; z: number; y: number; nat: number; hL: number; hR: number } => { let i = 0; while (i < RW.length - 2 && RW[i + 1][0] < s) i++; const a = RW[i], b = RW[i + 1]; const t = (s - a[0]) / (b[0] - a[0]); return { x: lerp(a[1], b[1], t), z: lerp(a[2], b[2], t), y: lerp(a[3], b[3], t), nat: lerp(a[4], b[4], t), hL: lerp(a[5], b[5], t), hR: lerp(a[9], b[9], t) }; };
const dist2seg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => { const dx = bx - ax, dz = bz - az; const L2 = dx * dx + dz * dz; let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, pz - az - t * dz); };
const distR6 = (px: number, pz: number): number => { let b = 1e9; for (let i = 0; i < RW.length - 1; i++) b = Math.min(b, dist2seg(px, pz, RW[i][1], RW[i][2], RW[i + 1][1], RW[i + 1][2])); return b; };
// ---- 1) crossing: R6 centre line x every rail edge
let cross: any = null;
for (const e of RAIL.edges as any[]) for (let i = 0; i < e.xs.length - 1; i++) for (let k = 0; k < RW.length - 1; k++) {
  const p = [RW[k][1], RW[k][2]], q = [RW[k + 1][1], RW[k + 1][2]], a = [e.xs[i], e.zs[i]], b = [e.xs[i + 1], e.zs[i + 1]];
  const rx = q[0] - p[0], rz = q[1] - p[1], sx = b[0] - a[0], sz = b[1] - a[1]; const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) continue;
  const t = ((a[0] - p[0]) * sz - (a[1] - p[1]) * sx) / den, u = ((a[0] - p[0]) * rz - (a[1] - p[1]) * rx) / den; if (t < 0 || t > 1 || u < 0 || u > 1) continue;
  const rl = Math.hypot(rx, rz), sl = Math.hypot(sx, sz);
  cross = { edge: e.id, edgeIdx: (RAIL.edges as any[]).indexOf(e), seg: i, sArm: RW[k][0] + t * (RW[k + 1][0] - RW[k][0]), sRail: e.cum[i] + u * sl, x: p[0] + t * rx, z: p[1] + t * rz, railDesign: lerp(e.design[i], e.design[i + 1], u), railDir: [sx / sl, sz / sl], armDir: [rx / rl, rz / rl] };
}
if (!cross) throw new Error('no R6 / rail crossing found');
const dot = cross.armDir[0] * cross.railDir[0] + cross.armDir[1] * cross.railDir[1]; const skewDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI; const skewAcute = skewDeg > 90 ? 180 - skewDeg : skewDeg;
const sinPhi = Math.sin(skewAcute * Math.PI / 180);
const edge: any = (RAIL.edges as any[])[cross.edgeIdx]; const seg = (edge.segments as any[]).find((q) => cross.sRail >= q.s0 && cross.sRail <= q.s1);
const inStation = (RAIL.stations as any[]).some((s) => Math.hypot(s.x - cross.x, s.z - cross.z) < D.stationFlat + 40);
const deckHalf = inStation ? 9.6 : D.deckHalf, capAcross = inStation ? 9.2 : 5.0;
const deckTop = cross.railDesign, deckSoffit = deckTop - D.ballast - D.deckThick;
// ---- 2) road under the deck: levels, clearance
const lenUnderDeck = 2 * deckHalf / sinPhi;
const sA = cross.sArm - lenUnderDeck / 2, sB = cross.sArm + lenUnderDeck / 2; const yHigh = rowAt(sA).y, yLow = rowAt(sB).y, yC = rowAt(cross.sArm).y;
const gradePct = 100 * (yHigh - yLow) / lenUnderDeck;
const clearMin = deckSoffit - yHigh, clearCentre = deckSoffit - yC;
// ---- 3) fill and wall under the viaduct (J6 rule: fill > 4 m = MSE wall, toe 0.5 + 0.2 H)
const rc = rowAt(cross.sArm); const H = Math.max(rc.hL, rc.hR); const wallToe = TOP_HALF + 0.5 + 0.2 * H; const WORK = 1.0;
const needFaceCol = wallToe + WORK, needFaceCap = TOP_HALF + D.pierRoadGap;
// ---- 4) piers
type Rect = { hl: number; ha: number };
const COL: Rect = { hl: 1.3, ha: 2.2 }, CAP: Rect = { hl: 1.6, ha: capAcross };
const railPt = (s: number): { x: number; z: number; dx: number; dz: number; i: number } => { const e = edge; let i = 0; while (i < e.cum.length - 2 && e.cum[i + 1] < s) i++; const t = (s - e.cum[i]) / (e.cum[i + 1] - e.cum[i]); const dx = e.xs[i + 1] - e.xs[i], dz = e.zs[i + 1] - e.zs[i]; const l = Math.hypot(dx, dz); return { x: lerp(e.xs[i], e.xs[i + 1], t), z: lerp(e.zs[i], e.zs[i + 1], t), dx: dx / l, dz: dz / l, i }; };
const corners = (cx: number, cz: number, dx: number, dz: number, r: Rect): number[][] => { const nx = -dz, nz = dx; const o: number[][] = []; for (const a of [-1, 1]) for (const b of [-1, 1]) o.push([cx + a * r.hl * dx + b * r.ha * nx, cz + a * r.hl * dz + b * r.ha * nz]); return o; };
const gap = (cx: number, cz: number, dx: number, dz: number, r: Rect): number => { let m = 1e9; for (const c of corners(cx, cz, dx, dz, r)) m = Math.min(m, distR6(c[0], c[1])); const cd = distR6(cx, cz); return cd < m ? -cd : m; };
const okPier = (s: number): boolean => { const p = railPt(s); return gap(p.x, p.z, p.dx, p.dz, COL) >= needFaceCol && gap(p.x, p.z, p.dx, p.dz, CAP) >= needFaceCap; };
const piersNear: any[] = (RAIL.piers as any[]).filter((p) => p.edgeId === edge.id && Math.abs(p.s - cross.sRail) < 130).sort((a, b) => a.s - b.s).map((p) => ({ s: r2(p.s), x: r2(p.x), z: r2(p.z), baseY: r2(p.baseY), deckY: r2(p.deckY), dx: r2(p.dx), dz: r2(p.dz), gapCol: r2(gap(p.x, p.z, p.dx, p.dz, COL)), gapCap: r2(gap(p.x, p.z, p.dx, p.dz, CAP)), ok: gap(p.x, p.z, p.dx, p.dz, COL) >= needFaceCol && gap(p.x, p.z, p.dx, p.dz, CAP) >= needFaceCap }));
const bad = piersNear.filter((p) => !p.ok); const goodBefore = piersNear.filter((p) => p.ok && p.s < cross.sRail).slice(-1)[0], goodAfter = piersNear.filter((p) => p.ok && p.s > cross.sRail)[0];
let sNewA = NaN, sNewB = NaN; for (let s = cross.sRail; s > goodBefore.s + 12; s -= 0.5) if (okPier(s)) { sNewA = s; break; } for (let s = cross.sRail; s < goodAfter.s - 12; s += 0.5) if (okPier(s)) { sNewB = s; break; }
const mk = (s: number): any => { const p = railPt(s); const sc = g.makeSample(); g.sampleNatural(p.x, p.z, sc); const t = (s - edge.cum[p.i]) / (edge.cum[p.i + 1] - edge.cum[p.i]); return { s: r2(s), x: r2(p.x), z: r2(p.z), baseY: r2(sc.h), deckY: r2(lerp(edge.design[p.i], edge.design[p.i + 1], t)), dx: r2(p.dx), dz: r2(p.dz), gapCol: r2(gap(p.x, p.z, p.dx, p.dz, COL)), gapCap: r2(gap(p.x, p.z, p.dx, p.dz, CAP)) }; };
const newPiers = [mk(sNewA), mk(sNewB)];
const chain = [goodBefore.s, sNewA, sNewB, goodAfter.s]; const spans = [chain[1] - chain[0], chain[2] - chain[1], chain[3] - chain[2]].map(r2);
const midSpan = spans[1];
const wallLen = 2 * (lenUnderDeck / 2 + 20);
const DATA = {
  generated: '2026-11-24',
  crossing: { edge: edge.id, segKind: seg ? seg.kind : '?', segWhy: seg ? seg.why : '?', sRail: r2(cross.sRail), sArm: r2(cross.sArm), x: r2(cross.x), z: r2(cross.z), skewDeg: r2(skewDeg), skewAcuteDeg: r2(skewAcute), railDir: cross.railDir.map(r2), armDir: cross.armDir.map(r2), inStation },
  rail: { deckTop: r2(deckTop), ballast: D.ballast, deckThick: D.deckThick, soffit: r2(deckSoffit), deckHalf, capAcross, capH: 1.5, capSoffit: r2(deckSoffit - 1.5), pierCol: COL, pierCap: CAP, naturalGround: r2(rc.nat), pierRoadGap: D.pierRoadGap, spanNormal: D.spanNormal, spanMax: D.spanMax, roadClearance: D.roadClearance },
  road: { section: 'M6', topHalf: TOP_HALF, pavementEdge: SECTION_M6.pavementEdge, levelCentre: r2(yC), levelAtHighEdgeOfDeck: r2(yHigh), levelAtLowEdgeOfDeck: r2(yLow), gradePct: r2(gradePct), lenUnderDeck: r2(lenUnderDeck), sUnderDeck: [r2(sA), r2(sB)], natural: r2(rc.nat), fillH: r2(H), fillL: r2(rc.hL), fillR: r2(rc.hR), horizontal: 'straight (k = 0) at the crossing', drains: 'falls 3.2 % away from the roundabout, no sag: gravity drainage' },
  clear: { min: r2(clearMin), centre: r2(clearCentre), required: 5.5, capClear: r2(deckSoffit - 1.5 - yHigh), spare: r2(clearMin - 5.5) },
  wall: { rule: 'J6: fill > 4 m = MSE wall, toe offset 0.5 + 0.2 H', fillH: r2(H), faceHalf: TOP_HALF, toeHalf: r2(wallToe), workGap: WORK, needFaceCol: r2(needFaceCol), needFaceCap: r2(needFaceCap), stripLen: r2(wallLen), sStrip: [r2(cross.sArm - wallLen / 2), r2(cross.sArm + wallLen / 2)], topLevel: r2(yHigh), baseLevel: r2(rc.nat), wallH: r2(yHigh - rc.nat) },
  piers: { existing: piersNear, conflicts: bad.map((p: any) => p.s), removed: bad.map((p: any) => p.s), added: newPiers, keptNeighbours: [goodBefore.s, goodAfter.s], spans, midSpan, spanOverDepth: r2(midSpan / D.deckThick) },
  rows: [-60, -40, -20, 0, 20, 40, 60].map((d) => { const q = rowAt(cross.sArm + d); return { d, s: r2(cross.sArm + d), level: r2(q.y), natural: r2(q.nat), fill: r2(q.y - q.nat), clear: r2(deckSoffit - q.y) }; }),
  armPoly: RW.filter((q) => q[0] > cross.sArm - 70 && q[0] < cross.sArm + 70).map((q) => [q[1], q[2], q[3], q[4]]),
};
writeFileSync('docs/J300_STRUCT_B.json', JSON.stringify(DATA));
const ts = `// GENERATED by scripts/j300-struct-b-gen.ts (J7-B, 2026-11-24). Do not edit: rerun the script. NOTHING imports this file (Config switch OFF).\n// R6 road under the railway viaduct (rail edge ${edge.id}). World x, z in m, levels in m.\nexport const J300_STRUCT_B = ${JSON.stringify(DATA)} as const;\n`;
writeFileSync('src/roads/junction/J300StructB.ts', ts);
console.log('crossing', DATA.crossing.sArm, 'soffit', DATA.rail.soffit, 'min clear', DATA.clear.min, 'new piers', newPiers.map((p: any) => p.s), 'spans', spans);
