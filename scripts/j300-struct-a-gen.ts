// J7-A GENERATOR (headless). Ring UNDERPASS BOX under the raised roundabout: cells, walls, roof deck, portals, wing walls, drainage sump.
// Writes src/roads/junction/J300StructA.ts (GENERATED data, nothing imports it) and docs/J300_STRUCT_A.json.  Run: npx tsx scripts/j300-struct-a-gen.ts   Then: npx tsx scripts/j300-struct-a-check.ts docs
// Inputs: docs/J300_GEOM.json (frame, deck), docs/J300_RAMPS.json (ring level table, step 5 m, local u from -700), J2 numbers (docs/J300_SECTIONS.txt). FRAME as J4: local u along the ring, v LEFT of u, origin = roundabout centre; world = O + u (cos yaw, sin yaw) + v (sin yaw, -cos yaw).
import { readFileSync, writeFileSync } from 'fs';
import { SECTION_M8 } from '../src/roads/standards/SectionTable';
const r2 = (x: number): number => Math.round(x * 100) / 100;
const G: any = JSON.parse(readFileSync('docs/J300_GEOM.json', 'utf8')); const RM: any = JSON.parse(readFileSync('docs/J300_RAMPS.json', 'utf8'));
const FR = G.frame; const DECK = FR.deckY as number; const yaw = FR.yaw as number; const ux = Math.cos(yaw), uz = Math.sin(yaw);
const toW = (u: number, v: number): { x: number; z: number } => ({ x: r2(FR.ox + u * ux + v * uz), z: r2(FR.oz + u * uz - v * ux) });
const RT: number[][] = RM.ringTable; const ringY = (u: number): number => { const t = (u + 700) / 5; const i = Math.max(0, Math.min(RT.length - 2, Math.floor(t))); return RT[i][1] + (t - i) * (RT[i + 1][1] - RT[i][1]); };
// ---- J2 numbers (ASSUMED values from J2, kept)
const RO = 62, OVER = 5, U1 = RO + OVER;                       // box ends 5 m beyond the roundabout outer edge
const CELL = 22.1, WALL_C = 1.2, WALL_O = 1.0, CLEAR = 5.5, ROOF = 2.0, SLAB = 0.8;
const vCellIn = WALL_C / 2, vCellOut = vCellIn + CELL, vOut = vCellOut + WALL_O;   // 0.6, 22.7, 23.7
const soffit = DECK - ROOF;                                    // 33.3
const stations: any[] = []; for (let u = -U1; u <= U1 + 1e-9; u += 5.5) { const uu = Math.min(U1, r2(u)); const y = ringY(uu); stations.push({ u: uu, ring: r2(y), clear: r2(soffit - y), floorBot: r2(y - SLAB) }); }
let low = stations[0]; for (const s of stations) if (s.ring < low.ring) low = s;
let lowFine = { u: 0, y: 1e9 }; for (let u = -U1; u <= U1; u += 0.5) { const y = ringY(u); if (y < lowFine.y) lowFine = { u, y }; }
const maxRing = Math.max(...stations.map((s) => s.ring)), minClear = Math.min(...stations.map((s) => s.clear));
// ---- drainage: the ring is a SAG here (levels fall to the low point, rise on both sides), so the box CANNOT drain to its portals -> sump + pumps (J2 assumed -0.05 % to both portals: not true on the real profile)
const APPROACH = 60;                                           // m of ring each side of the box that drains into the sag after the last inlet (ASSUMED: inlets every 40 m, 60 m bypass)
const PAVE = 2 * SECTION_M8.pavementEdge; const catchLen = 2 * U1 + 2 * APPROACH; const catchA = catchLen * PAVE; const RAIN = 100, Cr = 0.9; // mm/h ASSUMED, runoff coefficient
const Qdesign = Cr * (RAIN / 1000) * catchA / 3600;            // m3/s
const PUMP = 0.15, NPUMP = 3;                                  // m3/s each, 2 duty + 1 standby (ASSUMED)
const sump = ['L', 'R'].map((side, k) => { const s = k === 0 ? 1 : -1; return { side, u0: r2(lowFine.u - 2), u1: r2(lowFine.u + 2), v0: r2(s * 0.8), v1: r2(s * 2.8), depth: 3.0, floorY: r2(lowFine.y - SLAB - 3.0), pumps: 3, pumpQ: PUMP, centre: toW(lowFine.u, s * 1.8) }; });
// ---- wing walls (ring side, outside each portal): 12 m long, inner face on the barrier line v = +-22.7, thick 0.6 -> 0.4, top = ASSUMED ramp / platform level (J7-C replaces it with the real J5 ramp rows)
const WING = 12; const wing: any[] = []; for (const eu of [-1, 1]) for (const sv of [1, -1]) { const rows: any[] = []; for (let d = 0; d <= WING + 1e-9; d += 3) { const u = eu * (U1 + d); const top = DECK - 0.05 * (Math.abs(u) - RO); rows.push({ d: r2(d), u: r2(u), top: r2(top), ring: r2(ringY(u)), h: r2(top - ringY(u)), t: r2(0.6 - 0.2 * d / WING) }); }
  wing.push({ id: `W${eu > 0 ? 'E' : 'W'}${sv > 0 ? 'L' : 'R'}`, portal: eu > 0 ? 'E' : 'W', side: sv > 0 ? 'L' : 'R', vFace: sv * vCellOut, rows, start: toW(eu * U1, sv * vCellOut), end: toW(eu * (U1 + WING), sv * vCellOut) }); }
const DATA = {
  generated: '2026-11-24', frame: { ox: FR.ox, oz: FR.oz, yaw, yawDeg: FR.yawDeg, u0: FR.u0, deckY: DECK },
  box: { u0: -U1, u1: U1, length: 2 * U1, over: OVER, cellClear: CELL, centralWall: WALL_C, outerWall: WALL_O, clearW: 2 * CELL + WALL_C, outsideW: 2 * vOut, vCentral: [-vCellIn, vCellIn], cells: [{ id: 'L', v0: vCellIn, v1: vCellOut }, { id: 'R', v0: -vCellOut, v1: -vCellIn }], outerWalls: [{ v0: vCellOut, v1: vOut }, { v0: -vOut, v1: -vCellOut }], clearH: CLEAR, roof: { thick: ROOF, topY: DECK, soffitY: soffit, spanClear: CELL, spanDepth: r2(CELL / ROOF) }, baseSlab: SLAB, corners: [toW(-U1, vOut), toW(U1, vOut), toW(U1, -vOut), toW(-U1, -vOut)], centre: toW(0, 0) },
  stations, ring: { min: low.ring, max: maxRing, lowPointU: lowFine.u, lowPointY: r2(lowFine.y), minClear, sagLowInside: Math.abs(lowFine.u) < U1, gradeToCentrePct: r2(100 * (ringY(U1) - lowFine.y) / (U1 + lowFine.u)) },
  drainage: { catchLen, catchWidth: r2(PAVE), catchArea: Math.round(catchA), rainMmH: RAIN, runoffC: Cr, QdesignLs: Math.round(Qdesign * 1000), pumps: NPUMP, pumpLs: PUMP * 1000, dutyCapacityLs: (NPUMP - 1) * PUMP * 1000, sump, note: 'ring profile is a sag, low point inside the box; no gravity outfall; power back-up needed (NOT designed)' },
  portals: ['W', 'E'].map((p) => ({ id: p, u: p === 'E' ? U1 : -U1, faceV: [-vOut, vOut], topY: DECK, ringY: r2(ringY(p === 'E' ? U1 : -U1)), clearAtPortal: r2(soffit - ringY(p === 'E' ? U1 : -U1)), centre: toW(p === 'E' ? U1 : -U1, 0) })),
  wing,
};
writeFileSync('docs/J300_STRUCT_A.json', JSON.stringify(DATA));
const ts = `// GENERATED by scripts/j300-struct-a-gen.ts (J7-A, 2026-11-24). Do not edit: rerun the script. NOTHING imports this file (Config switch OFF).\n// Ring underpass box under the raised roundabout of the 300 ft junction. Local frame: u along the ring, v LEFT, origin = roundabout centre; world = O + u (cos yaw, sin yaw) + v (sin yaw, -cos yaw). Levels in m.\nexport const J300_STRUCT_A = ${JSON.stringify(DATA)} as const;\n`;
writeFileSync('src/roads/junction/J300StructA.ts', ts);
console.log('box u', -U1, '..', U1, 'clear W', DATA.box.clearW, 'outside', DATA.box.outsideW, 'soffit', soffit, 'min clear', minClear, 'ring max', maxRing);
console.log('ring low point u', lowFine.u, 'y', r2(lowFine.y), 'inside box', DATA.ring.sagLowInside, 'grade to centre %', DATA.ring.gradeToCentrePct);
console.log('drainage Q', Math.round(Qdesign * 1000), 'L/s, catchment', Math.round(catchA), 'm2; pumps', NPUMP, 'x', PUMP * 1000, 'L/s; wing walls', wing.length);
