// J6 TERRAIN GENERATOR (headless). Writes src/roads/junction/J300Terrain.ts (GENERATED data, nothing imports it yet) and docs/J300_TERRAIN.json.
// Pure math + the real game terrain (natural ground, read only). Inputs: docs/J300_GEOM.json (frame, deck, arm rows R6 / R4 with level + natural), docs/J300_RAMPS.json (J5 rows), the real planned ring (existing embankment).
// Run: npx tsx scripts/j300-terrain-gen.ts      Then: npx tsx scripts/j300-terrain-check.ts docs
// RULES (J2): fill above 4 m = vertical MSE wall, toe offset 0.2 H (+0.5 m wall / barrier margin kept here, conservative); fill up to 4 m = slope 1:2; cut = slope 1:2 (benches NOT modelled, deep cut volume is the plain 1:2 figure).
// EXISTING RING EMBANKMENT is subtracted: ring surface level (planRing) for |v| <= 22.1, then slope 1:2 down to the natural ground. New fill = deck - max(natural, existing).
// FRAME as J4: local u along the ring, v = LEFT; world = O + u (cos yaw, sin yaw) + v (sin yaw, -cos yaw).
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { planRing } from '../src/roads/ring/RingRoad';
import { SECTION_M6, SECTION_M4 } from '../src/roads/standards/SectionTable';

const r2 = (x: number): number => Math.round(x * 100) / 100;
const G: any = JSON.parse(readFileSync('docs/J300_GEOM.json', 'utf8')); const RM: any = JSON.parse(readFileSync('docs/J300_RAMPS.json', 'utf8'));
const FR = G.frame; const DECK = FR.deckY as number; const U0 = FR.u0 as number; const yaw = FR.yaw as number; const ux = Math.cos(yaw), uz = Math.sin(yaw);
const toW = (u: number, v: number): { x: number; z: number } => ({ x: FR.ox + u * ux + v * uz, z: FR.oz + u * uz - v * ux });
const toL = (x: number, z: number): { u: number; v: number } => ({ u: (x - FR.ox) * ux + (z - FR.oz) * uz, v: (x - FR.ox) * uz - (z - FR.oz) * ux });
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const natXZ = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const RT: number[][] = RM.ringTable; const ringY = (u: number): number => { const t = (u + 700) / 5; const i = Math.max(0, Math.min(RT.length - 2, Math.floor(t))); return RT[i][1] + (t - i) * (RT[i + 1][1] - RT[i][1]); };
/** existing ring embankment level at local (u, v): ring surface to |v| 22.1, then 1:2 down; NaN-safe (returns -1e9 far away) */
const existing = (u: number, v: number): number => { const a = Math.abs(v); return a <= 22.1 ? ringY(u) : ringY(u) - (a - 22.1) / 2; };
const wallOff = (h: number): number => (h > 4 ? 0.5 + 0.2 * h : 2 * h); // toe offset beyond the top edge for a fill of height h
const R6TOP = SECTION_M6.pavementEdge + 0.6, R4TOP = SECTION_M4.pavementEdge + 0.6;

// ---------------------------------------------------------------- platform (roundabout deck, r 62, centre = local origin)
const RO = 62; const plat: any = { deckY: DECK, ro: RO, toe: [] as number[][], note: 'toe = [angleDeg, toeRadius, fillHeightAtEdge, naturalAtEdge, worldX, worldZ]' };
let platVol = 0, platMaxH = 0;
for (let a = 0; a < 360; a += 5) {
  const t = a * Math.PI / 180; const nE = (() => { const p = toW(RO * Math.cos(t), RO * Math.sin(t)); return natXZ(p.x, p.z); })();
  const hE = Math.max(0, DECK - nE); platMaxH = Math.max(platMaxH, hE); const rt = RO + wallOff(hE); const pt = toW(rt * Math.cos(t), rt * Math.sin(t));
  plat.toe.push([a, r2(rt), r2(hE), r2(nE), r2(pt.x), r2(pt.z)]);
}
{ const dr = 3, dt = 5 * Math.PI / 180; for (let a = 0; a < 360; a += 5) { const t = (a + 2.5) * Math.PI / 180; for (let r = dr / 2; r < RO; r += dr) { const u = r * Math.cos(t), v = r * Math.sin(t); if (Math.abs(v) <= 23.7 && Math.abs(u) <= 67) continue; // underpass strip: existing ring embankment + box (no new fill, J2)
  const p = toW(u, v); const g = Math.max(natXZ(p.x, p.z), existing(u, v)); platVol += Math.max(0, DECK - g) * r * dr * dt; } }
  for (let i = 0; i < plat.toe.length; i++) { const hE = plat.toe[i][2]; platVol += hE * (plat.toe[i][1] - RO) / 2 * RO * 5 * Math.PI / 180; } } // wall / slope wedge
plat.fillVolume = Math.round(platVol); plat.maxFill = r2(platMaxH);

// ---------------------------------------------------------------- arms (R6 M6, R4 M4): cross-section at each 5 m row, left / right of the travel direction
function arm(id: string, top: number): any {
  const rows: any[] = G.arms[id].rows; const out: number[][] = []; let fill = 0, cut = 0, cutMax = 0, fillMax = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)]; const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz); const nx = -dz / L, nz = dx / L; // normal (left in world xz)
    const ds = i === 0 ? 0 : r.s - rows[i - 1].s; const rec: number[] = [r.s, r.x, r.z, r.y, r.nat];
    let aSum = 0, cSum = 0;
    for (const sd of [1, -1]) {
      let area = 0; for (let o = 1; o <= top; o += 2) { const g = natXZ(r.x + sd * nx * o, r.z + sd * nz * o); area += 2 * Math.max(0, r.y - g); cSum += 2 * Math.max(0, g - r.y); }
      const ex = r.x + sd * nx * top, ez = r.z + sd * nz * top; const gE = natXZ(ex, ez); const h = r.y - gE; let toe = top;
      if (h > 0) { toe = top + wallOff(h); area += h * (toe - top) / 2; fillMax = Math.max(fillMax, h); } else if (h < 0) { const c = -h; toe = top + 2 * c; cutMax = Math.max(cutMax, c); cSum += c * c; }
      aSum += area; const tp = { x: r.x + sd * nx * toe, z: r.z + sd * nz * toe }; rec.push(r2(h), r2(toe), r2(tp.x), r2(tp.z));
    }
        fill += ds * aSum; cut += ds * cSum; out.push(rec);
  }
  return { id, top, rowFormat: '[s, x, z, level, natural, hLeft, toeLeft, toeLeftX, toeLeftZ, hRight, toeRight, toeRightX, toeRightZ]  (h > 0 fill, h < 0 cut, toe = offset from the centre line)', rows: out, fillVolume: Math.round(fill), cutVolume: Math.round(cut), fillMax: r2(fillMax), cutMax: r2(cutMax), rowHalf: id === 'R6' ? SECTION_M6.rowHalf : SECTION_M4.rowHalf, length: G.arms[id].length };
}
const R6 = arm('R6', R6TOP), R4 = arm('R4', R4TOP);

// ---------------------------------------------------------------- ramps (from J5 rows): footprint of the outer toe per row
const ramps = RM.ramps.map((r: any) => { const toe: number[][] = []; let toeMax = 0;
  for (const x of r.rows) { const h = x[4] - x[5]; const body = !x[11] && Math.abs(x[0]) <= r.noseX; /* before the nose only: the aux lane stands on the existing ring embankment */ const off = h > 0 && body ? 0.6 + wallOff(h) : 0; const sg = Math.sign(x[10]) || 1; const tv = x[10] + sg * off; const p = toW(x[9], tv); toe.push([x[0], r2(tv), r2(h), r2(p.x), r2(p.z)]); if (body && h > 0) toeMax = Math.max(toeMax, Math.abs(tv)); }
  return { id: r.id, noseX: r.noseX, toeFormat: '[u, toeV, fillHeight, worldX, worldZ]', toe, fillMax: r.fillMax, cutMax: r.cutMax, fillVolume: r.fillVolume, toeMaxV: r2(toeMax) }; });

const total = plat.fillVolume + R6.fillVolume + R4.fillVolume + ramps.reduce((s: number, r: any) => s + r.fillVolume, 0);
const OUT = { generated: '2026-11-24', frame: FR, platform: plat, arms: { R6, R4 }, ramps, totals: { fillTotal: total, platform: plat.fillVolume, R6: R6.fillVolume, R4fill: R4.fillVolume, R4cut: R4.cutVolume, R6cut: R6.cutVolume, ramps: ramps.reduce((s: number, r: any) => s + r.fillVolume, 0), j2Rough: 441475, j1bRough: 855000 } };
writeFileSync('docs/J300_TERRAIN.json', JSON.stringify(OUT));
const ts = `// GENERATED by scripts/j300-terrain-gen.ts (STEP J6). Do not edit: rerun the script. Sources: J4 (docs/J300_GEOM.json), J5 (docs/J300_RAMPS.json), the game natural terrain, the planned ring.
// J300 TERRAIN FOOTPRINT DATA (Type B, B2, u0 = -125): finished toe lines and fill / cut heights of the platform, the R6 / R4 arms and the 4 ramps. PURE DATA, not imported by the game yet (J9 carves with it).
// Rules: fill > 4 m = vertical MSE wall (toe offset 0.5 + 0.2 H), fill <= 4 m = slope 1:2, cut slope 1:2 (benches not modelled). Existing ring embankment is NOT new fill.
export const J300_TERRAIN_TOTALS = ${JSON.stringify(OUT.totals)} as const;
export const J300_PLATFORM = ${JSON.stringify(OUT.platform)} as const;
export const J300_ARM_TERRAIN = ${JSON.stringify(OUT.arms)} as const;
export const J300_RAMP_TERRAIN = ${JSON.stringify(OUT.ramps)} as const;
`;
writeFileSync('src/roads/junction/J300Terrain.ts', ts);
console.log('J300Terrain.ts written', ts.length, 'bytes');
console.log(`platform fill ${plat.fillVolume} m3, max edge fill ${plat.maxFill} m`); for (const A of [R6, R4]) console.log(`${A.id} fill ${A.fillVolume} m3 (max ${A.fillMax} m), cut ${A.cutVolume} m3 (max ${A.cutMax} m)`);
for (const r of ramps) console.log(`${r.id} fill ${r.fillVolume} m3 max ${r.fillMax} m, toe |v| ${r.toeMaxV}`); console.log('TOTAL fill', total);
